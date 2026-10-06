import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookConcept, BookOutline } from "@/ai/schemas";
import type { GenerationConfig } from "@/lib/run-events";
import { manuscriptDigest } from "@/lib/manuscript-state";
import { creditsForUsd } from "@/lib/billing/credits-shared";
import { chapterWaveRequiredUsd, editorialWaveRequiredUsd } from "./opening-credit-plan";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getBalance: vi.fn(),
  getOrCreateBook: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});

vi.mock("@/lib/billing/credits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/credits")>();
  return { ...actual, getBalance: mocks.getBalance };
});

vi.mock("@/db/queries/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/queries/projects")>();
  return { ...actual, getOrCreateBook: mocks.getOrCreateBook };
});

import {
  chapterWaveCreditCheckStep,
  editorialWaveCreditCheckStep,
  openingCreditCheckStep,
  resolvedChapterTargetWords,
} from "./steps";
import { pruneChapterWork, pruneEditWork } from "./work-state";

function queryResult<T>(rows: T[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    then: (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

const config: GenerationConfig = {
  tier: "standard",
  requireOutlineApproval: false,
  waveSize: 4,
  targetChapters: 1,
  targetWordsPerChapter: 2_000,
  inputSnapshot: {
    brief: "A cartographer follows a disappearing road.",
    genre: "Fantasy",
    styleGuide: null,
    voiceProfile: null,
    pov: null,
    tense: null,
    tone: null,
    styleProfile: null,
    heatLevel: null,
    violenceLevel: null,
    profanity: null,
    avoidTopics: [],
  },
  resumeFromRunId: "11111111-1111-4111-8111-111111111111",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getBalance.mockResolvedValue(0);
  mocks.getOrCreateBook.mockResolvedValue({ id: "book-1" });
});

describe("chapterWaveCreditCheckStep", () => {
  it("uses current project words for regeneration even when the persisted outline is stale", () => {
    expect(
      resolvedChapterTargetWords(
        { chapterRegeneration: true, targetWordsPerChapter: 2_400 },
        5_000,
      ),
    ).toBe(2_400);
    expect(resolvedChapterTargetWords({ targetWordsPerChapter: 2_400 }, 5_000)).toBe(5_000);
  });

  it("includes the post-write summary ceiling for a fresh planned chapter at exact balance", async () => {
    const planned = {
      chapterNumber: 1,
      status: "planned" as const,
      content: "",
      wordCount: 0,
      qualityScore: null,
    };
    const requiredUsd = chapterWaveRequiredUsd(config, [
      {
        chapterNumber: 1,
        writer: "full",
        summary: true,
        editorial: "none",
        revision: false,
      },
    ]);
    const exactCredits = creditsForUsd(requiredUsd);
    mocks.getBalance.mockResolvedValue(exactCredits);
    const select = vi
      .fn()
      .mockReturnValueOnce(queryResult([{ id: "project-1", title: "The River Door" }]))
      .mockReturnValueOnce(queryResult([{ config }]))
      .mockReturnValueOnce(queryResult([planned]));
    mocks.getDb.mockReturnValue({ select });

    await expect(
      chapterWaveCreditCheckStep(
        { dbRunId: "run-2", projectId: "project-1", userId: "user-1" },
        config,
        [1],
      ),
    ).resolves.toEqual({
      balance: exactCredits,
      required: exactCredits,
      sufficient: true,
    });
  });

  it("quotes only a missing summary when prose already committed", async () => {
    const content = "The finished chapter.";
    const stored: GenerationConfig = {
      ...config,
      work: {
        chapters: {
          "1": {
            result: {
              content,
              wordCount: 3,
              qualityScore: 0.8,
              critique: null,
            },
          },
        },
      },
    };
    mocks.getBalance.mockResolvedValue(100);
    const select = vi
      .fn()
      .mockReturnValueOnce(queryResult([{ id: "project-1", title: "The River Door" }]))
      .mockReturnValueOnce(queryResult([{ config: stored }]))
      .mockReturnValueOnce(
        queryResult([
          {
            chapterNumber: 1,
            status: "drafted",
            content,
            wordCount: 3,
            qualityScore: "0.800",
          },
        ]),
      );
    mocks.getDb.mockReturnValue({ select });

    const result = await chapterWaveCreditCheckStep(
      { dbRunId: "run-2", projectId: "project-1", userId: "user-1" },
      config,
      [1],
    );
    const requiredUsd = chapterWaveRequiredUsd(config, [
      {
        chapterNumber: 1,
        writer: "none",
        summary: true,
        editorial: "none",
        revision: false,
      },
    ]);
    expect(result.required).toBe(creditsForUsd(requiredUsd));
  });
});

describe("openingCreditCheckStep", () => {
  it("requires zero balance when the compatible source finished all metered work", async () => {
    const content = "The finished chapter.";
    const digest = createHash("sha256").update(content).digest("hex");
    const chapterRow = {
      id: "chapter-1",
      chapterNumber: 1,
      title: "The Map",
      summary: "The journey begins.",
      status: "edited" as const,
      content,
      wordCount: 3,
      qualityScore: "0.800",
    };
    const currentManuscriptDigest = manuscriptDigest([chapterRow]);
    const sourceConfig: GenerationConfig = {
      ...config,
      stagedConcept: { title: "The River Door" } as BookConcept,
      stagedOutline: {
        chapters: [{ number: 1, title: "The Map" }],
      } as BookOutline,
      manuscriptPrepared: true,
      completion: {
        entityBible: {
          sourceRunId: config.resumeFromRunId!,
          entityCount: 8,
          relationshipCount: 5,
        },
        chapterSummaries: {
          "1": { sourceRunId: config.resumeFromRunId!, contentDigest: digest },
        },
        editedChapters: {
          "1": {
            sourceRunId: config.resumeFromRunId!,
            contentDigest: digest,
            changed: true,
          },
        },
        continuityReport: {
          sourceRunId: config.resumeFromRunId!,
          manuscriptDigest: currentManuscriptDigest,
          report: {
            score: 0.9,
            recommendation: "Ready",
            phases: [],
            issues: [],
            worstChapters: [],
          },
        },
      },
    };
    const select = vi
      .fn()
      .mockReturnValueOnce(
        queryResult([
          {
            id: config.resumeFromRunId!,
            status: "failed",
            config: sourceConfig,
          },
        ]),
      )
      .mockReturnValueOnce(queryResult([{ id: "project-1", title: "The River Door" }]))
      .mockReturnValueOnce(queryResult([chapterRow]));
    mocks.getDb.mockReturnValue({ select });

    await expect(
      openingCreditCheckStep(
        { dbRunId: "run-2", projectId: "project-1", userId: "user-1" },
        config,
      ),
    ).resolves.toEqual({ balance: 0, required: 0, sufficient: true });
  });

  it("lets a fully checkpointed retry finish DB-only work with a negative balance", async () => {
    const sourceConfig: GenerationConfig = {
      ...config,
      stagedConcept: { title: "The River Door" } as BookConcept,
      stagedOutline: { chapters: [] } as unknown as BookOutline,
      manuscriptPrepared: true,
      completion: {
        entityBible: {
          sourceRunId: config.resumeFromRunId!,
          entityCount: 8,
          relationshipCount: 5,
        },
        continuityReport: {
          sourceRunId: config.resumeFromRunId!,
          manuscriptDigest: manuscriptDigest([]),
          report: {
            score: 0.9,
            recommendation: "Ready",
            phases: [],
            issues: [],
            worstChapters: [],
          },
        },
      },
    };
    mocks.getBalance.mockResolvedValue(-4);
    const select = vi
      .fn()
      .mockReturnValueOnce(
        queryResult([
          {
            id: config.resumeFromRunId!,
            status: "failed",
            config: sourceConfig,
          },
        ]),
      )
      .mockReturnValueOnce(queryResult([{ id: "project-1", title: "The River Door" }]))
      .mockReturnValueOnce(queryResult([]));
    mocks.getDb.mockReturnValue({ select });

    await expect(
      openingCreditCheckStep(
        { dbRunId: "run-2", projectId: "project-1", userId: "user-1" },
        config,
      ),
    ).resolves.toEqual({ balance: -4, required: 0, sufficient: true });
  });
});

describe("credit checks over pruned work state", () => {
  const original = "The harbor smelled of salt and cold iron.";
  const edited = "Salt and cold iron rode the harbor wind.";
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  const prunedEdit = pruneEditWork({
    baseContentDigest: sha(original),
    content: edited,
    changed: true,
    notes: [],
  })!;
  const chapterRow = (content: string) => ({
    chapterNumber: 1,
    status: "edited" as const,
    content,
    wordCount: 8,
    qualityScore: "0.650",
  });

  async function editorialRequired(stored: GenerationConfig, content: string) {
    mocks.getBalance.mockResolvedValue(100);
    const select = vi
      .fn()
      .mockReturnValueOnce(queryResult([{ id: "project-1", title: "The River Door" }]))
      .mockReturnValueOnce(queryResult([{ config: stored }]))
      .mockReturnValueOnce(queryResult([chapterRow(content)]));
    mocks.getDb.mockReturnValue({ select });
    return (
      await editorialWaveCreditCheckStep(
        { dbRunId: "run-2", projectId: "project-1", userId: "user-1" },
        config,
        [1],
        "editorial",
      )
    ).required;
  }

  it("charges nothing for an edit the chapter already holds, from its digest alone", async () => {
    const stored = { ...config, work: { edits: { "editorial:1": prunedEdit } } };
    await expect(editorialRequired(stored, edited)).resolves.toBe(0);
  });

  it("quotes the edit again when its text was pruned and the author restored the original", async () => {
    // The base digest still matches, but there is no text left to re-apply,
    // so the step will buy the edit again — and the quote must say so.
    const stored = { ...config, work: { edits: { "editorial:1": prunedEdit } } };
    const expected = creditsForUsd(
      editorialWaveRequiredUsd(
        config,
        [{ chapterNumber: 1, writer: "none", summary: false, editorial: "full", revision: false }],
        "editorial",
      ),
    );
    await expect(editorialRequired(stored, original)).resolves.toBe(expected);
  });

  it("falls back to the chapter row when a written chapter's work was pruned", async () => {
    const content = "The finished chapter.";
    const stored: GenerationConfig = {
      ...config,
      work: {
        chapters: {
          "1": pruneChapterWork(
            { result: { content, wordCount: 3, qualityScore: 0.8, critique: null } },
            sha(content),
          )!,
        },
      },
      completion: {
        chapterSummaries: { "1": { sourceRunId: "run-2", contentDigest: sha(content) } },
      },
    };
    mocks.getBalance.mockResolvedValue(100);
    const select = vi
      .fn()
      .mockReturnValueOnce(queryResult([{ id: "project-1", title: "The River Door" }]))
      .mockReturnValueOnce(queryResult([{ config: stored }]))
      .mockReturnValueOnce(
        queryResult([{ ...chapterRow(content), status: "drafted" as const, wordCount: 3 }]),
      );
    mocks.getDb.mockReturnValue({ select });

    await expect(
      chapterWaveCreditCheckStep(
        { dbRunId: "run-2", projectId: "project-1", userId: "user-1" },
        config,
        [1],
      ),
    ).resolves.toMatchObject({ required: 0 });
  });
});

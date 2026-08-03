import { describe, expect, it } from "vitest";

import { meteredOperationCeilingCredits, meteredOperationCeilingUsd } from "@/ai/metering-limits";
import { MODELS } from "@/ai/models";
import {
  CREDIT_MARKUP,
  CREDIT_PACKS,
  creditsForUsd,
  SIGNUP_GRANT_CREDITS,
} from "@/lib/billing/credits-shared";
import type { GenerationConfig } from "@/lib/run-events";

import {
  chapterWaveRequiredUsd,
  conceptRequiredUsd,
  continuityPhaseRequiredUsd,
  creativeQuestionRequiredUsd,
  freshOpeningRequiredUsd,
  initialOutlineRequiredUsd,
  resumeOpeningRequiredUsd,
  singleChapterRequiredUsd,
} from "./opening-credit-plan";

const config: GenerationConfig = {
  tier: "standard",
  requireOutlineApproval: true,
  waveSize: 4,
  targetChapters: 12,
  targetWordsPerChapter: 3_000,
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
};

describe("opening credit plan", () => {
  it("uses the same hard per-operation ceilings as concept and outline calls", () => {
    const model = MODELS.standard.concept;
    const expected = [
      "concept.expand",
      "concept.refine",
      "outliner.plan",
      "outliner.outline",
      "outliner.selfCheck",
    ].reduce(
      (total, operation) =>
        total +
        meteredOperationCeilingUsd({
          model: operation.startsWith("outliner.") ? MODELS.standard.outline : model,
          operation,
        }),
      0,
    );
    expect(freshOpeningRequiredUsd(config)).toBe(expected);
  });

  it("sizes an opening parent hold as the exact sum of quantized child claims", () => {
    const operations = [
      ["concept.expand", MODELS.standard.concept],
      ["concept.refine", MODELS.standard.concept],
      ["outliner.plan", MODELS.standard.outline],
      ["outliner.outline", MODELS.standard.outline],
      ["outliner.selfCheck", MODELS.standard.outline],
    ] as const;
    const childCredits = operations.reduce(
      (total, [operation, model]) => total + meteredOperationCeilingCredits({ model, operation }),
      0,
    );

    expect(creditsForUsd(freshOpeningRequiredUsd(config))).toBeCloseTo(childCredits, 10);
  });

  it("splits protocol-v3 concept, question, and outline gates at exact operation ceilings", () => {
    expect(conceptRequiredUsd(config)).toBe(
      meteredOperationCeilingUsd({
        model: MODELS.standard.concept,
        operation: "concept.expand",
      }) +
        meteredOperationCeilingUsd({
          model: MODELS.standard.concept,
          operation: "concept.refine",
        }),
    );
    expect(creativeQuestionRequiredUsd(config)).toBe(
      meteredOperationCeilingUsd({
        model: MODELS.standard.outline,
        operation: "creative.question",
      }),
    );
    expect(initialOutlineRequiredUsd(config)).toBe(
      ["outliner.plan", "outliner.outline", "outliner.selfCheck"].reduce(
        (total, operation) =>
          total + meteredOperationCeilingUsd({ model: MODELS.standard.outline, operation }),
        0,
      ),
    );
  });

  it("keeps the welcome grant viable for opening and Starter viable for a standard wave", () => {
    const openingCredits = freshOpeningRequiredUsd(config) * CREDIT_MARKUP;
    const chapters = Array.from({ length: config.waveSize }, (_, index) => ({
      chapterNumber: index + 1,
      writer: "full" as const,
      summary: true,
      editorial: "none" as const,
      revision: false,
    }));
    const waveCredits = chapterWaveRequiredUsd(config, chapters) * CREDIT_MARKUP;
    const starter = CREDIT_PACKS.find((pack) => pack.id === "starter");

    expect(openingCredits).toBeLessThanOrEqual(SIGNUP_GRANT_CREDITS);
    expect(waveCredits).toBeLessThanOrEqual(starter!.credits);
  });

  it("uses the full writer and summary ceiling for a single-chapter regeneration", () => {
    expect(singleChapterRequiredUsd(config)).toBe(
      chapterWaveRequiredUsd(config, [
        {
          chapterNumber: 1,
          writer: "full",
          summary: true,
          editorial: "none",
          revision: false,
        },
      ]),
    );
  });

  it("sizes a writer-wave parent as the exact sum of every parallel child claim", () => {
    const maxOutputTokensPerStep = Math.round(
      Math.min(10_000, config.targetWordsPerChapter * 1.2) * 1.5,
    );
    const oneChapterCredits = [
      meteredOperationCeilingCredits({
        model: MODELS.standard.planner,
        operation: "writer.plan",
      }),
      meteredOperationCeilingCredits({
        model: MODELS.standard.prose,
        operation: "writer.draft",
        maxOutputTokensPerStep,
      }),
      meteredOperationCeilingCredits({
        model: MODELS.standard.critic,
        operation: "writer.critique",
      }),
      meteredOperationCeilingCredits({
        model: MODELS.standard.prose,
        operation: "writer.revise",
      }),
      meteredOperationCeilingCredits({
        model: MODELS.standard.summarizer,
        operation: "summarizer.chapter",
      }),
    ].reduce((total, credits) => total + credits, 0);
    const chapters = Array.from({ length: config.waveSize }, (_, index) => ({
      chapterNumber: index + 1,
      writer: "full" as const,
      summary: true,
      editorial: "none" as const,
      revision: false,
    }));

    expect(creditsForUsd(chapterWaveRequiredUsd(config, chapters))).toBeCloseTo(
      oneChapterCredits * config.waveSize,
      10,
    );
  });

  it("requires zero when a compatible source completed every metered artifact", () => {
    expect(
      resumeOpeningRequiredUsd(config, {
        entityBible: false,
        chapters: [],
        continuityPhasesRemaining: 0,
        continuityPhasesTotal: 6,
      }),
    ).toBe(0);
  });

  it("prices only pending source work and caps chapters at one opening wave", () => {
    const one = resumeOpeningRequiredUsd(config, {
      entityBible: false,
      chapters: [
        {
          chapterNumber: 9,
          writer: "none",
          summary: true,
          editorial: "none",
          revision: false,
        },
      ],
      continuityPhasesRemaining: 0,
      continuityPhasesTotal: 6,
    });
    const five = resumeOpeningRequiredUsd(config, {
      entityBible: false,
      chapters: Array.from({ length: 5 }, (_, index) => ({
        chapterNumber: index + 1,
        writer: "full" as const,
        summary: true,
        editorial: "expected" as const,
        revision: false,
      })),
      continuityPhasesRemaining: 0,
      continuityPhasesTotal: 6,
    });
    const four = resumeOpeningRequiredUsd(config, {
      entityBible: false,
      chapters: Array.from({ length: 4 }, (_, index) => ({
        chapterNumber: index + 1,
        writer: "full" as const,
        summary: true,
        editorial: "expected" as const,
        revision: false,
      })),
      continuityPhasesRemaining: 0,
      continuityPhasesTotal: 6,
    });

    expect(one).toBeGreaterThan(0);
    expect(five).toBe(four);
  });

  it("prices a summary-only retry as summary work, not a full draft wave", () => {
    const summaryOnly = {
      chapterNumber: 4,
      writer: "none" as const,
      summary: true,
      editorial: "none" as const,
      revision: false,
    };
    expect(
      resumeOpeningRequiredUsd(config, {
        entityBible: false,
        chapters: [summaryOnly],
        continuityPhasesRemaining: 0,
        continuityPhasesTotal: 6,
      }),
    ).toBe(chapterWaveRequiredUsd(config, [summaryOnly]));
  });

  it("gates only the next continuity phase instead of the unrelated whole tail", () => {
    expect(
      resumeOpeningRequiredUsd(config, {
        entityBible: false,
        chapters: [],
        continuityPhasesRemaining: 4,
        continuityPhasesTotal: 6,
      }),
    ).toBe(continuityPhaseRequiredUsd(config));
  });
});

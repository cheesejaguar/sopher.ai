import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  critiqueSchema,
  critiqueWireSchema,
  revisionWireSchema,
  type ChapterOutlinePlan,
  type ScenePlan,
} from "@/ai/schemas";

const mocks = vi.hoisted(() => ({
  outputs: [] as unknown[],
  calls: [] as { prompt: string; schema: unknown }[],
}));

vi.mock("ai", () => ({
  generateText: vi.fn(async (options: { prompt?: unknown; output?: { schema?: unknown } }) => {
    mocks.calls.push({ prompt: String(options.prompt ?? ""), schema: options.output?.schema });
    if (mocks.outputs.length === 0) throw new Error("No mocked writer output remains");
    return { output: mocks.outputs.shift() };
  }),
  streamText: vi.fn(() => {
    throw new Error("streamText should not run: these tests start from a checkpointed draft");
  }),
  isStepCount: vi.fn(() => () => false),
  tool: vi.fn((definition: unknown) => definition),
  Output: { object: vi.fn(({ schema }: { schema: unknown }) => ({ schema })) },
}));

vi.mock("@/ai/metering", () => ({
  gatewayOptions: vi.fn(() => ({})),
  metered: vi.fn(
    async (_meter: unknown, _info: unknown, run: () => Promise<unknown>) => await run(),
  ),
}));

vi.mock("@/ai/tools", () => ({ buildToolset: vi.fn(() => ({})) }));

import { writeChapter, type ChapterWriterCtx } from "./chapter-writer";

/**
 * Two paragraphs whose first sentence is quotable verbatim, so a revision can
 * anchor to real prose and a dropped replacement is visible as prose that
 * survived unchanged.
 */
const ANCHOR = "The harbor smelled of salt and cold iron.";
const SECOND_ANCHOR = "Mira counted the ships twice before she believed the number.";
const DRAFT = `${ANCHOR} Gulls turned above the ledger house.\n\n${SECOND_ANCHOR} Nine hulls, and not one of them hers.`;

const chapterOutline: ChapterOutlinePlan = {
  number: 3,
  title: "The Salt Ledger",
  summary: "Mira reaches the harbor and finds the ledger short.",
  keyEvents: ["Mira counts the ships"],
  charactersPresent: ["Mira"],
  emotionalArc: "rising_action",
  openingHook: "Salt on the wind",
  closingHook: "The ledger is short by one",
  targetWords: 2_000,
};

const scenePlan: ScenePlan = {
  scenes: [
    {
      beat: "Arrival",
      povGoal: "Reach the ledger house before dusk",
      conflict: "The harbormaster is gone",
      exitState: "Mira holds the ledger",
      charactersNeeded: ["Mira"],
    },
  ],
  openingHookApproach: "Open on the smell of the harbor",
  closingHookApproach: "End on the missing hull",
};

function writerCtx(overrides: Partial<ChapterWriterCtx> = {}): ChapterWriterCtx {
  return {
    meter: { userId: "user_1", projectId: "proj_1", runId: "run_1" },
    tools: { userId: "user_1", projectId: "proj_1", bookId: "book_1" },
    tier: "standard",
    chapterNumber: 3,
    totalChapters: 12,
    chapterOutline,
    prevSummaries: [],
    targetWords: 2_000,
    ...overrides,
  };
}

/** Runs only the critique (and, when it asks for one, the revision) call. */
async function runFromDraft(...modelOutputs: unknown[]) {
  mocks.outputs.push(...modelOutputs);
  return writeChapter(writerCtx(), { checkpoint: { scenePlan, draft: DRAFT } });
}

const critique = (over: Record<string, unknown> = {}) => ({
  verdict: "revise",
  score: 0.72,
  issues: [
    {
      spanQuote: ANCHOR,
      problem: "The opening leans on smell alone",
      fix: "Give the reader something moving",
      severity: "major",
    },
  ],
  ...over,
});

const passingCritique = (over: Record<string, unknown> = {}) => ({
  verdict: "pass",
  score: 0.88,
  issues: [],
  ...over,
});

beforeEach(() => {
  mocks.outputs.length = 0;
  mocks.calls.length = 0;
});

/**
 * Anthropic's structured-output path strips the numeric and length bounds from
 * the schema it shows the model, and does not enforce z.enum from it either.
 * Every answer below is one a critic model plausibly gives; under the strict
 * schema each threw NoObjectGeneratedError, retried identically at full cost,
 * and discarded a chapter that was already drafted and paid for.
 */
describe("writeChapter critique", () => {
  it("hands the provider the permissive wire schema, not the strict one", async () => {
    await runFromDraft(passingCritique());
    expect(mocks.calls[0].schema).toBe(critiqueWireSchema);
  });

  it("keeps a well-formed critique intact", async () => {
    const result = await runFromDraft(passingCritique());
    expect(result.qualityScore).toBeCloseTo(0.88, 5);
    expect(result.content).toBe(DRAFT);
    expect(critiqueSchema.safeParse(result.critique).success).toBe(true);
  });

  /**
   * The single most likely way a critic ignores an invisible `.max(1)`: it
   * scores out of ten. Read as a percentage this would persist 0.08 and brand a
   * good chapter as near-worthless.
   */
  it("reads a mid-range score of 8 as 0.8, not 0.08", async () => {
    const result = await runFromDraft(passingCritique({ score: 8 }));
    expect(result.qualityScore).toBeCloseTo(0.8, 5);
  });

  it("reads a percentage score of 85 as 0.85", async () => {
    const result = await runFromDraft(passingCritique({ score: 85 }));
    expect(result.qualityScore).toBeCloseTo(0.85, 5);
  });

  it('reads a score sent as the string "0.9" as 0.9', async () => {
    const result = await runFromDraft(passingCritique({ score: "0.9" }));
    expect(result.qualityScore).toBeCloseTo(0.9, 5);
  });

  it("scores an unreadable answer neutrally instead of failing the chapter", async () => {
    const result = await runFromDraft(passingCritique({ score: null }));
    expect(result.qualityScore).toBe(0.5);
    expect(critiqueSchema.safeParse(result.critique).success).toBe(true);
  });

  it("survives 9 issues when the cap is 8", async () => {
    const result = await runFromDraft(
      passingCritique({
        issues: Array.from({ length: 9 }, (_, index) => ({
          spanQuote: `span ${index + 1}`,
          problem: `Problem ${index + 1}`,
          fix: `Fix ${index + 1}`,
          severity: "minor",
        })),
      }),
    );
    expect(result.critique?.issues).toHaveLength(8);
    expect(critiqueSchema.safeParse(result.critique).success).toBe(true);
  });

  it('survives verdict "needs_revision", which is in no enum the model was shown', async () => {
    // Falls back to "revise", so the major issue below still drives a revision.
    const result = await runFromDraft(critique({ verdict: "needs_revision" }), {
      replacements: [{ original: ANCHOR, revised: "Salt and cold iron rode the wind." }],
    });
    expect(result.critique?.verdict).toBe("revise");
    expect(result.content).toContain("Salt and cold iron rode the wind.");
  });

  it('survives severity "high", which is in no enum the model was shown', async () => {
    const result = await runFromDraft(
      critique({ issues: [{ ...critique().issues[0], severity: "high" }] }),
    );
    expect(["minor", "major"]).toContain(result.critique?.issues[0].severity);
    expect(critiqueSchema.safeParse(result.critique).success).toBe(true);
  });

  it("drops an issue that never names a problem rather than inventing one", async () => {
    const result = await runFromDraft(
      passingCritique({
        issues: [{ spanQuote: ANCHOR, fix: "Something", severity: "minor" }],
      }),
    );
    expect(result.critique?.issues).toHaveLength(0);
  });

  it("survives issues sent as null instead of an empty list", async () => {
    const result = await runFromDraft(passingCritique({ issues: null }));
    expect(result.critique?.issues).toEqual([]);
    expect(result.content).toBe(DRAFT);
  });
});

describe("writeChapter revision", () => {
  it("hands the provider the permissive wire schema, not the strict one", async () => {
    await runFromDraft(critique(), { replacements: [] });
    expect(mocks.calls[1].schema).toBe(revisionWireSchema);
  });

  it("applies a well-formed replacement and credits the revision bump", async () => {
    const result = await runFromDraft(critique(), {
      replacements: [{ original: ANCHOR, revised: "Salt and cold iron rode the wind." }],
    });
    expect(result.content).toContain("Salt and cold iron rode the wind.");
    expect(result.content).not.toContain(ANCHOR);
    expect(result.qualityScore).toBeCloseTo(0.82, 5);
  });

  /**
   * The most dangerous normalizer bug this product could have. `revised` is the
   * prose that replaces the anchor; defaulting a missing one to "" applies as a
   * deletion, and the author loses the passage. (The unnormalized path was
   * worse still: `String.replace` stringifies `undefined`, stamping the literal
   * word "undefined" into the manuscript.)
   */
  it("drops a replacement with no revised text instead of deleting the passage", async () => {
    const result = await runFromDraft(critique(), {
      replacements: [{ original: ANCHOR }],
    });
    expect(result.content).toContain(ANCHOR);
    expect(result.content).not.toContain("undefined");
    expect(result.content).toBe(DRAFT);
    // Nothing landed, so the revision bump is not credited either.
    expect(result.qualityScore).toBeCloseTo(0.72, 5);
  });

  it("drops a null revised value for the same reason", async () => {
    const result = await runFromDraft(critique(), {
      replacements: [{ original: ANCHOR, revised: null }],
    });
    expect(result.content).toBe(DRAFT);
  });

  it("keeps the surviving replacements when one entry is unusable", async () => {
    const result = await runFromDraft(critique(), {
      replacements: [
        { original: ANCHOR },
        { original: SECOND_ANCHOR, revised: "Mira counted the ships three times." },
      ],
    });
    expect(result.content).toContain(ANCHOR);
    expect(result.content).toContain("Mira counted the ships three times.");
  });

  /** An explicit empty string is the model saying "cut this", and is honored. */
  it("honors an explicit empty revised value as a deletion", async () => {
    const result = await runFromDraft(critique(), {
      replacements: [{ original: `${ANCHOR} `, revised: "" }],
    });
    expect(result.content).not.toContain(ANCHOR);
    expect(result.content).toContain(SECOND_ANCHOR);
  });

  it("survives 13 replacements when the cap is 12", async () => {
    const result = await runFromDraft(critique(), {
      replacements: Array.from({ length: 13 }, (_, index) => ({
        original: `nothing-${index}`,
        revised: `something-${index}`,
      })),
    });
    // All 13 anchors are absent from the draft, so nothing lands; the point is
    // that an over-long list no longer throws away the paid revision call.
    expect(result.content).toBe(DRAFT);
  });

  it("survives replacements sent as null instead of an empty list", async () => {
    const result = await runFromDraft(critique(), { replacements: null });
    expect(result.content).toBe(DRAFT);
    expect(result.qualityScore).toBeCloseTo(0.72, 5);
  });

  it("caps the revision bump at 1", async () => {
    const result = await runFromDraft(critique({ score: 0.98 }), {
      replacements: [{ original: ANCHOR, revised: "Salt and cold iron rode the wind." }],
    });
    expect(result.qualityScore).toBe(1);
  });
});

describe("writeChapter draft tier", () => {
  it("skips the critique entirely", async () => {
    const result = await writeChapter(writerCtx({ tier: "draft" }), {
      checkpoint: { scenePlan, draft: DRAFT },
    });
    expect(mocks.calls).toHaveLength(0);
    expect(result.critique).toBeNull();
    expect(result.qualityScore).toBe(0.75);
  });
});

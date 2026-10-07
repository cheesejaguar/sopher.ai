import { streamText } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  critiqueSchema,
  critiqueWireSchema,
  revisionWireSchema,
  type ChapterOutlinePlan,
  type ScenePlan,
} from "@/ai/schemas";

type MockStreamPart = { type: string; text?: string; error?: unknown };
type MockStep = { text: string; finishReason: string };

const mocks = vi.hoisted(() => ({
  outputs: [] as unknown[],
  calls: [] as { prompt: string; schema: unknown }[],
  stream: null as null | { parts: MockStreamPart[]; steps: MockStep[] },
}));

vi.mock("ai", () => ({
  generateText: vi.fn(async (options: { prompt?: unknown; output?: { schema?: unknown } }) => {
    mocks.calls.push({ prompt: String(options.prompt ?? ""), schema: options.output?.schema });
    if (mocks.outputs.length === 0) throw new Error("No mocked writer output remains");
    return { output: mocks.outputs.shift() };
  }),
  streamText: vi.fn(() => {
    const stream = mocks.stream;
    if (!stream) throw new Error("streamText should not run: no mocked draft stream");
    return {
      fullStream: (async function* () {
        yield* stream.parts;
      })(),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      response: Promise.resolve({}),
      steps: Promise.resolve(stream.steps),
    };
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

import {
  ChapterDraftIncompleteError,
  ChapterDraftTruncatedError,
  selectDraftProse,
  writeChapter,
  type ChapterWriterCtx,
} from "./chapter-writer";

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
  mocks.stream = null;
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

  it("inserts revised prose literally, never as a $-replacement pattern", async () => {
    const result = await runFromDraft(critique(), {
      replacements: [{ original: ANCHOR, revised: "The fare was $$$, or $& and $' and $`." }],
    });
    expect(result.content).toContain("The fare was $$$, or $& and $' and $`.");
    expect(result.content).not.toContain(ANCHOR);
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

  it("never returns a checkpointed result whose text was pruned", async () => {
    const result = await writeChapter(writerCtx({ tier: "draft" }), {
      checkpoint: {
        scenePlan,
        draft: DRAFT,
        result: { wordCount: 12, qualityScore: 0.9, critique: null } as never,
      },
    });
    expect(result.content).toBe(DRAFT);
  });
});

/** One streamed provider step: its text deltas between step boundaries. */
function streamStep(text: string, finishReason: string) {
  const parts: MockStreamPart[] = [{ type: "start-step" }];
  // Several deltas, as a provider sends them, so live gating is exercised.
  for (const chunk of text.match(/[\s\S]{1,40}/g) ?? []) {
    parts.push({ type: "text-delta", text: chunk });
  }
  if (finishReason === "tool-calls") parts.push({ type: "tool-call" });
  parts.push({ type: "finish-step" });
  return { parts, step: { text, finishReason } };
}

function mockDraftStream(...steps: ReturnType<typeof streamStep>[]) {
  mocks.stream = {
    parts: steps.flatMap((step) => step.parts),
    steps: steps.map((step) => step.step),
  };
}

// ~630 words: comfortably above the incomplete-draft floor for a 2,000-word target.
const PROSE = Array.from(
  { length: 70 },
  (_, index) => `Paragraph ${index + 1}: Mira counted the hulls against the ledger again.`,
).join("\n\n");
const PREAMBLE = "I'll check the story bible for Mira and the harbor first.";
const POSTAMBLE = "I've recorded the new entities and relationships.";

describe("writeChapter draft", () => {
  it("keeps only the prose step, even when it ends in tool calls", async () => {
    mockDraftStream(
      streamStep(PREAMBLE, "tool-calls"),
      // The working method asks for the chapter, then canon writes, so the
      // prose step itself finishes on tool calls.
      streamStep(PROSE, "tool-calls"),
      streamStep(POSTAMBLE, "stop"),
    );
    const deltas: string[] = [];
    const checkpoints: { draft?: string }[] = [];

    const result = await writeChapter(
      writerCtx({ tier: "draft", onProseDelta: (delta) => void deltas.push(delta) }),
      {
        checkpoint: { scenePlan },
        onCheckpoint: (next) => void checkpoints.push(next),
      },
    );

    expect(result.content).toBe(PROSE);
    expect(result.content).not.toContain(PREAMBLE);
    expect(result.content).not.toContain(POSTAMBLE);
    expect(checkpoints[0].draft).toBe(PROSE);
    // Chatter never reached the live view; the prose did, in full.
    expect(deltas.join("")).toBe(PROSE);
  });

  it("refuses a draft that hit its output limit instead of saving it", async () => {
    mockDraftStream(streamStep(PREAMBLE, "tool-calls"), streamStep(PROSE, "length"));
    const onCheckpoint = vi.fn();

    await expect(
      writeChapter(writerCtx({ tier: "draft" }), { checkpoint: { scenePlan }, onCheckpoint }),
    ).rejects.toBeInstanceOf(ChapterDraftTruncatedError);
    // No truncated draft checkpoint for a retry to resume from.
    expect(onCheckpoint).not.toHaveBeenCalled();
  });

  it("refuses working notes in place of a chapter instead of saving them", async () => {
    // What Sonnet 5.5 produced when it spent every tool step on lookups.
    mockDraftStream(
      streamStep(PREAMBLE, "tool-calls"),
      streamStep("Let me check a few details on the ledger.", "tool-calls"),
      streamStep("Let me check the harbor next.", "stop"),
    );
    const onCheckpoint = vi.fn();

    await expect(
      writeChapter(writerCtx({ tier: "draft" }), { checkpoint: { scenePlan }, onCheckpoint }),
    ).rejects.toBeInstanceOf(ChapterDraftIncompleteError);
    expect(onCheckpoint).not.toHaveBeenCalled();
    expect(new ChapterDraftIncompleteError(2, 1_000).isRetryable).toBe(true);
  });

  it("asks for the chapter on the tool-free final step only when none was written", async () => {
    mockDraftStream(streamStep(PROSE, "stop"));
    await writeChapter(writerCtx({ tier: "draft" }), { checkpoint: { scenePlan } });
    const { prepareStep } = vi.mocked(streamText).mock.calls.at(-1)![0] as unknown as {
      prepareStep: (options: {
        stepNumber: number;
        steps: { text: string }[];
        messages: unknown[];
        instructions?: unknown;
      }) => { activeTools?: unknown[]; messages?: { role: string; content: string }[] };
    };
    const messages = [{ role: "user", content: "Write chapter 1" }];

    expect(prepareStep({ stepNumber: 1, steps: [{ text: PREAMBLE }], messages })).toEqual({});

    const nudged = prepareStep({
      stepNumber: 2,
      steps: [{ text: PREAMBLE }, { text: "Let me check the ledger." }],
      messages,
    });
    expect(nudged.activeTools).toEqual([]);
    expect(nudged.messages?.at(-1)).toMatchObject({
      role: "user",
      content: expect.stringContaining("write the complete chapter now"),
    });

    const alreadyWritten = prepareStep({
      stepNumber: 2,
      steps: [{ text: PREAMBLE }, { text: PROSE }],
      messages,
    });
    expect(alreadyWritten).toEqual({ activeTools: [] });
  });

  it("marks a truncation retryable so the workflow redrafts", () => {
    expect(new ChapterDraftTruncatedError(3, 8_000).isRetryable).toBe(true);
  });
});

describe("selectDraftProse", () => {
  it("keeps both halves of a chapter split around a mid-draft lookup", () => {
    const firstHalf = PROSE.slice(0, PROSE.length / 2);
    const secondHalf = PROSE.slice(PROSE.length / 2);
    const prose = selectDraftProse([
      { text: PREAMBLE, finishReason: "tool-calls" },
      { text: firstHalf, finishReason: "tool-calls" },
      { text: secondHalf, finishReason: "stop" },
    ]);
    expect(prose.text).toBe(`${firstHalf.trim()}\n\n${secondHalf.trim()}`);
    expect(prose.truncated).toBe(false);
  });

  it("ignores a truncated chatter step that is not the chapter", () => {
    expect(
      selectDraftProse([
        { text: PROSE, finishReason: "tool-calls" },
        { text: POSTAMBLE, finishReason: "length" },
      ]),
    ).toEqual({ text: PROSE, truncated: false });
  });
});

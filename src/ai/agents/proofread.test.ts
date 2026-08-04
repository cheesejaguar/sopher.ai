import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PROOFREAD_SUGGESTIONS, PROOFREAD_CATEGORIES } from "@/ai/prompts/proofread";

const mocks = vi.hoisted(() => ({
  outputs: [] as unknown[],
  calls: [] as { prompt: string; schema: unknown }[],
}));

vi.mock("ai", () => ({
  generateText: vi.fn(async (options: { prompt?: unknown; output?: { schema?: unknown } }) => {
    mocks.calls.push({ prompt: String(options.prompt ?? ""), schema: options.output?.schema });
    if (mocks.outputs.length === 0) throw new Error("No mocked proofread output remains");
    return { output: mocks.outputs.shift() };
  }),
  Output: { object: vi.fn(({ schema }: { schema: unknown }) => ({ schema })) },
}));

vi.mock("@/ai/metering", () => ({
  gatewayOptions: vi.fn(() => ({})),
  metered: vi.fn(
    async (_meter: unknown, _info: unknown, run: () => Promise<unknown>) => await run(),
  ),
}));

import {
  normalizeProofreadSuggestionList,
  PROOFREAD_SEVERITIES,
  proofreadChapter,
  proofreadSuggestionListSchema,
  proofreadSuggestionListWireSchema,
  resolveProofreadAnchors,
} from "./proofread";

const CHAPTER = [
  "She new the answer before he asked.",
  "The row of chairs were empty.",
  "He waited, the the room went quiet.",
].join(" ");

const meter = { userId: "user_1", projectId: "proj_1" };

const correction = (over: Record<string, unknown> = {}) => ({
  anchorText: "She new the answer before he asked.",
  replacement: "She knew the answer before he asked.",
  rationale: "“New” should be “knew”.",
  category: "usage",
  severity: "error",
  ...over,
});

beforeEach(() => {
  mocks.outputs.length = 0;
  mocks.calls.length = 0;
});

async function proofread(modelOutput: unknown) {
  mocks.outputs.push(modelOutput);
  const result = await proofreadChapter({
    meter,
    tier: "standard",
    chapterNumber: 4,
    content: CHAPTER,
  } as Parameters<typeof proofreadChapter>[0]);
  // Whatever the model said, the route still gets the strict domain type.
  expect(proofreadSuggestionListSchema.safeParse(result).success).toBe(true);
  return result;
}

/**
 * Every case below is an answer the model can plausibly give to the proofread
 * prompt. Anthropic's structured-output path strips `.min` / `.max` and does
 * not enforce `z.enum`, so the model is held to caps and vocabularies it was
 * never shown; before normalization each of these threw NoObjectGeneratedError,
 * retried identically, and cost the author a pass that produced nothing.
 */
describe("proofreadChapter", () => {
  it("hands the provider the permissive wire schema, not the strict one", async () => {
    await proofread({ corrections: [correction()] });
    expect(mocks.calls[0].schema).toBe(proofreadSuggestionListWireSchema);
  });

  it("keeps a well-formed answer intact", async () => {
    const result = await proofread({ corrections: [correction()] });
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0].replacement).toBe("She knew the answer before he asked.");
    expect(result.corrections[0].category).toBe("usage");
    expect(result.corrections[0].severity).toBe("error");
  });

  it(`survives ${MAX_PROOFREAD_SUGGESTIONS + 1} corrections when the cap is ${MAX_PROOFREAD_SUGGESTIONS}`, async () => {
    const result = await proofread({
      corrections: Array.from({ length: MAX_PROOFREAD_SUGGESTIONS + 1 }, (_, index) =>
        correction({ anchorText: `A whole sentence numbered ${index} for anchoring.` }),
      ),
    });
    expect(result.corrections).toHaveLength(MAX_PROOFREAD_SUGGESTIONS);
  });

  it('survives category "typo", which is in no enum the model was shown', async () => {
    const result = await proofread({ corrections: [correction({ category: "typo" })] });
    expect(PROOFREAD_CATEGORIES).toContain(result.corrections[0].category);
  });

  it('survives severity "critical", which the model reaches for unprompted', async () => {
    const result = await proofread({ corrections: [correction({ severity: "critical" })] });
    expect(PROOFREAD_SEVERITIES).toContain(result.corrections[0].severity);
    // An unreadable label must not be read as "this barely matters".
    expect(result.corrections[0].severity).not.toBe("info");
  });

  it('accepts a label the model capitalized, like "Grammar"', async () => {
    const result = await proofread({
      corrections: [correction({ category: "Grammar", severity: "Warning" })],
    });
    expect(result.corrections[0].category).toBe("grammar");
    expect(result.corrections[0].severity).toBe("warning");
  });

  it("survives a missing rationale without dropping a real correction", async () => {
    const result = await proofread({ corrections: [correction({ rationale: null })] });
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0].rationale).toBe("");
  });

  /**
   * The load-bearing case. A correction whose `replacement` never arrived would,
   * if defaulted to "", replace a whole sentence of the author's manuscript with
   * nothing — a silent deletion labelled "typo". Before normalization the
   * missing field reached `withinMechanicalScope`, which crashed on
   * `replacement.trim()` and took the pass down with it.
   */
  it("drops a correction with no replacement instead of deleting the sentence", async () => {
    const result = await proofread({
      corrections: [{ ...correction(), replacement: undefined }],
    });
    expect(result.corrections).toEqual([]);
    const anchored = resolveProofreadAnchors(CHAPTER, result.corrections);
    expect(anchored.resolved).toEqual([]);
  });

  it("drops a blank replacement, which is the same deletion by another route", async () => {
    for (const blank of ["", "   "]) {
      const result = await proofread({ corrections: [correction({ replacement: blank })] });
      expect(result.corrections).toEqual([]);
    }
  });

  it("drops an anchor too short to be a sentence rather than failing the pass", async () => {
    const result = await proofread({
      corrections: [correction({ anchorText: "the the" }), correction()],
    });
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0].anchorText).toBe("She new the answer before he asked.");
  });

  it("trims a padded anchor so it still resolves against the chapter", async () => {
    const result = await proofread({
      corrections: [correction({ anchorText: "  She new the answer before he asked.\n" })],
    });
    const anchored = resolveProofreadAnchors(CHAPTER, result.corrections);
    expect(anchored.resolved).toHaveLength(1);
    expect(anchored.resolved[0].start).toBe(0);
  });

  it("drops an over-long pair rather than truncating prose into nonsense", async () => {
    const long = `${"word ".repeat(300)}end.`;
    const result = await proofread({
      corrections: [correction({ anchorText: long, replacement: long })],
    });
    expect(result.corrections).toEqual([]);
  });

  it("survives the corrections key omitted entirely", async () => {
    const result = await proofread({});
    expect(result.corrections).toEqual([]);
  });
});

describe("normalizeProofreadSuggestionList", () => {
  it("never throws on a shape the provider was not asked for", () => {
    for (const wire of [null, undefined, "no errors found", 7, [], { corrections: "none" }]) {
      expect(normalizeProofreadSuggestionList(wire)).toEqual({ corrections: [] });
    }
  });

  it("drops unusable entries before the cap so a full page of fixes survives", () => {
    const usable = Array.from({ length: MAX_PROOFREAD_SUGGESTIONS }, (_, index) =>
      correction({ anchorText: `A whole sentence numbered ${index} for anchoring.` }),
    );
    const result = normalizeProofreadSuggestionList({
      corrections: [correction({ replacement: null }), ...usable],
    });
    expect(result.corrections).toHaveLength(MAX_PROOFREAD_SUGGESTIONS);
    expect(result.corrections.every((c) => c.replacement.trim().length > 0)).toBe(true);
  });
});

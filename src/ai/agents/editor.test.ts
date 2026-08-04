import { beforeEach, describe, expect, it, vi } from "vitest";
import { editSuggestionListSchema, editSuggestionListWireSchema } from "@/ai/schemas";

const mocks = vi.hoisted(() => ({
  outputs: [] as unknown[],
  calls: [] as { prompt: string; schema: unknown }[],
}));

vi.mock("ai", () => ({
  generateText: vi.fn(async (options: { prompt?: unknown; output?: { schema?: unknown } }) => {
    mocks.calls.push({ prompt: String(options.prompt ?? ""), schema: options.output?.schema });
    if (mocks.outputs.length === 0) throw new Error("No mocked editor output remains");
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
  editChapter,
  editReplacementsSchema,
  editReplacementsWireSchema,
  normalizeEditReplacements,
  reviewChapter,
} from "./editor";

const meter = { userId: "user_1", projectId: "proj_1" };
const tools = { userId: "user_1", projectId: "proj_1", bookId: "book_1" };

const DRAFT = [
  "The harbor smelled of salt and rope.",
  "Mira counted the boats twice and got a different number both times.",
  "She did not tell the harbourmaster, because he would have laughed.",
].join(" ");

beforeEach(() => {
  mocks.outputs.length = 0;
  mocks.calls.length = 0;
});

function chapterInput(over: Record<string, unknown> = {}) {
  return {
    meter,
    tools,
    tier: "standard" as const,
    chapterNumber: 3,
    content: DRAFT,
    ...over,
  } as Parameters<typeof editChapter>[0];
}

async function edit(modelOutput: unknown, content = DRAFT) {
  mocks.outputs.push(modelOutput);
  return await editChapter(chapterInput({ content }));
}

async function review(modelOutput: unknown) {
  mocks.outputs.push(modelOutput);
  const result = await reviewChapter({
    meter,
    tools,
    tier: "standard",
    chapterNumber: 3,
    content: DRAFT,
  } as Parameters<typeof reviewChapter>[0]);
  // Whatever the model said, the caller still gets the strict domain type.
  expect(editSuggestionListSchema.safeParse(result).success).toBe(true);
  return result;
}

/**
 * Every case below is an answer the model can plausibly give to the edit
 * prompt. Anthropic's structured-output path strips numeric and length bounds
 * from the schema it shows the model and does not enforce its enums, so the
 * model is held to caps it never saw; before normalization each of these threw
 * NoObjectGeneratedError and burned a paid pass that produced nothing.
 */
describe("editChapter", () => {
  const replacement = (over: Record<string, unknown> = {}) => ({
    original: "Mira counted the boats twice and got a different number both times.",
    revised: "Mira counted the boats twice and got two different numbers.",
    reason: "Tighter, same beat",
    ...over,
  });

  it("hands the provider the permissive wire schema, not the strict one", async () => {
    await edit({ replacements: [replacement()], notes: [] });
    expect(mocks.calls[0].schema).toBe(editReplacementsWireSchema);
  });

  it("keeps a well-formed answer intact", async () => {
    const result = await edit({ replacements: [replacement()], notes: ["Watch the hedging"] });
    expect(result.changed).toBe(true);
    expect(result.content).toContain("got two different numbers");
    expect(result.notes).toEqual(["Watch the hedging"]);
  });

  it("survives 16 replacements when the cap is 15, applying the first 15", async () => {
    const sentences = Array.from({ length: 16 }, (_, index) => `Original sentence ${index}.`);
    const longDraft = sentences.join(" ");
    const result = await edit(
      {
        replacements: sentences.map((sentence, index) => ({
          original: sentence,
          revised: `Revised sentence ${index}.`,
          reason: `Reason ${index}`,
        })),
        notes: [],
      },
      longDraft,
    );
    expect(result.content.match(/Revised sentence/g)).toHaveLength(15);
    // The sixteenth is the one dropped, and it survives untouched rather than
    // the whole edit being thrown away.
    expect(result.content).toContain("Original sentence 15.");
  });

  it("survives 11 editorial notes when the cap is 10", async () => {
    const result = await edit({
      replacements: [],
      notes: Array.from({ length: 11 }, (_, index) => `Note ${index + 1}`),
    });
    expect(result.notes).toHaveLength(10);
  });

  /**
   * The load-bearing case. `applyReplacements` does `draft.replace(original,
   * revised)`; with `revised` missing, JS coerced it and spliced the literal
   * string "undefined" into the author's chapter. Defaulting it to "" instead
   * would delete the sentence outright — so the entry is dropped.
   */
  it("drops a replacement with no revised text instead of deleting the sentence", async () => {
    const result = await edit({
      replacements: [{ original: DRAFT.split(". ")[1], reason: "Tighten" }],
      notes: [],
    });
    expect(result.content).toBe(DRAFT);
    expect(result.content).not.toContain("undefined");
    expect(result.changed).toBe(false);
  });

  it("drops a replacement whose revised text is null, not just absent", async () => {
    const result = await edit({
      replacements: [replacement({ revised: null })],
      notes: [],
    });
    expect(result.content).toBe(DRAFT);
    expect(result.content).not.toContain("null");
  });

  it("keeps an explicitly empty revision, which is a deliberate cut", async () => {
    const result = await edit({
      replacements: [replacement({ revised: "" })],
      notes: [],
    });
    expect(result.content).not.toContain("Mira counted the boats twice");
    expect(result.changed).toBe(true);
  });

  it("survives a missing reason without dropping the edit", async () => {
    const result = await edit({ replacements: [replacement({ reason: null })], notes: [] });
    expect(result.content).toContain("got two different numbers");
  });

  it("survives replacements and notes omitted entirely", async () => {
    const result = await edit({});
    expect(result.content).toBe(DRAFT);
    expect(result.notes).toEqual([]);
  });
});

describe("normalizeEditReplacements", () => {
  it("never throws on a shape the provider was not asked for", () => {
    for (const wire of [null, undefined, "sorry", 7, [], { replacements: "none" }]) {
      expect(normalizeEditReplacements(wire)).toEqual({ replacements: [], notes: [] });
    }
  });

  it("drops unusable entries before the cap so 15 applicable edits survive", () => {
    const usable = Array.from({ length: 15 }, (_, index) => ({
      original: `span ${index}`,
      revised: `better span ${index}`,
      reason: "",
    }));
    const result = normalizeEditReplacements({
      replacements: [{ original: "orphan", reason: "no revision" }, ...usable],
      notes: [],
    });
    expect(result.replacements).toHaveLength(15);
    expect(result.replacements.map((r) => r.original)).not.toContain("orphan");
  });

  it("lands every salvaged answer back on the strict schema", () => {
    const answers: unknown[] = [
      { replacements: Array.from({ length: 16 }, () => ({ original: "a", revised: "b" })) },
      { replacements: [{ original: "a" }], notes: Array.from({ length: 11 }, () => "note") },
      { replacements: [{ original: null, revised: 3 }], notes: [null, 7, "keep"] },
      "the chapter reads well",
    ];
    for (const answer of answers) {
      expect(editReplacementsSchema.safeParse(normalizeEditReplacements(answer)).success).toBe(
        true,
      );
    }
  });
});

/**
 * The anchored-suggestion mode feeds the web editor's accept/reject UI, so a
 * rejected response is a paid review the author never sees.
 */
describe("reviewChapter", () => {
  const suggestion = (over: Record<string, unknown> = {}) => ({
    anchorText: "The harbor smelled of salt and rope.",
    replacement: "The harbor smelled of salt and wet rope.",
    rationale: "Specificity",
    category: "line",
    severity: "info",
    ...over,
  });

  it("hands the provider the permissive wire schema, not the strict one", async () => {
    await review({ suggestions: [suggestion()] });
    expect(mocks.calls[0].schema).toBe(editSuggestionListWireSchema);
  });

  it("keeps a well-formed answer intact", async () => {
    const result = await review({ suggestions: [suggestion()] });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].replacement).toContain("wet rope");
  });

  it("survives 21 suggestions when the cap is 20", async () => {
    const result = await review({
      suggestions: Array.from({ length: 21 }, (_, index) =>
        suggestion({ anchorText: `A sentence long enough to anchor number ${index}.` }),
      ),
    });
    expect(result.suggestions).toHaveLength(20);
  });

  it('survives severity "critical", which is in no enum the model was shown', async () => {
    const result = await review({ suggestions: [suggestion({ severity: "critical" })] });
    expect(["info", "warning", "error"]).toContain(result.suggestions[0].severity);
  });

  it('survives category "voice", which the editor prompt itself invites', async () => {
    const result = await review({ suggestions: [suggestion({ category: "voice" })] });
    expect(["line", "structure", "continuity", "style"]).toContain(result.suggestions[0].category);
  });

  it("drops an anchor too short to locate rather than failing the review", async () => {
    const result = await review({
      suggestions: [suggestion({ anchorText: "rope." }), suggestion()],
    });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].anchorText).toBe("The harbor smelled of salt and rope.");
  });

  it("drops a suggestion with no replacement instead of proposing a deletion", async () => {
    const result = await review({ suggestions: [suggestion({ replacement: undefined })] });
    expect(result.suggestions).toEqual([]);
  });
});

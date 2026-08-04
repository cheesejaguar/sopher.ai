import { beforeEach, describe, expect, it, vi } from "vitest";
import { chapterSummarySchema, chapterSummaryWireSchema, type ChapterSummary } from "@/ai/schemas";
import type { DbTransaction } from "@/db";

const mocks = vi.hoisted(() => ({
  outputs: [] as unknown[],
  calls: [] as { prompt: string; schema: unknown }[],
}));

vi.mock("ai", () => ({
  generateText: vi.fn(async (options: { prompt?: unknown; output?: { schema?: unknown } }) => {
    mocks.calls.push({ prompt: String(options.prompt ?? ""), schema: options.output?.schema });
    if (mocks.outputs.length === 0) throw new Error("No mocked summarizer output remains");
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

vi.mock("@/db/queries/entities", () => ({ applyEntityDeltas: vi.fn() }));

import { applyEntityDeltas } from "@/db/queries/entities";
import {
  generateChapterSummary,
  persistChapterSummary,
  type ChapterSummaryInput,
} from "./summarizer";

const summaryInput: ChapterSummaryInput = {
  meter: { userId: "user_1", projectId: "proj_1", runId: "run_1" },
  bookId: "book_1",
  chapterNumber: 3,
  chapterTitle: "The Salt Ledger",
  content: "Mira reached the harbor at dusk and found the ledger short by one hull.",
  tier: "standard",
};

const wellFormed = {
  summary: "Mira reaches the harbor and finds the ledger short by one hull.",
  newFacts: [
    { kind: "character", name: "Mira", facts: ["Keeps the harbor ledger", "Storm-gray eyes"] },
    { kind: "location", name: "Cold Iron Harbor", facts: ["Nine berths, one empty"] },
  ],
  relationships: [
    {
      from: "Mira",
      to: "Cold Iron Harbor",
      type: "keeper_of",
      description: "She holds the ledger",
    },
  ],
  timelineNote: "Day four, dusk",
  moderation: { flagged: false },
};

async function summarize(modelOutput: unknown) {
  mocks.outputs.push(modelOutput);
  const result = await generateChapterSummary(summaryInput);
  // Whatever the model said, persistChapterSummary keeps the strict type.
  expect(chapterSummarySchema.safeParse(result).success).toBe(true);
  return result;
}

beforeEach(() => {
  mocks.outputs.length = 0;
  mocks.calls.length = 0;
});

/**
 * This call runs after every drafted chapter, so a rejection here strands prose
 * that is already written and paid for — and the story bible stops accreting,
 * which degrades every chapter after it. Anthropic's structured-output path
 * strips the caps below from the schema the model is shown and does not enforce
 * the entity-kind enum, so each answer here is one it plausibly gives.
 */
describe("generateChapterSummary", () => {
  it("hands the provider the permissive wire schema, not the strict one", async () => {
    await summarize(wellFormed);
    expect(mocks.calls[0].schema).toBe(chapterSummaryWireSchema);
  });

  it("keeps a well-formed answer intact", async () => {
    const result = await summarize(wellFormed);
    expect(result.summary).toBe(wellFormed.summary);
    expect(result.newFacts).toHaveLength(2);
    expect(result.newFacts[1].kind).toBe("location");
    expect(result.relationships).toHaveLength(1);
    expect(result.timelineNote).toBe("Day four, dusk");
    expect(result.moderation.flagged).toBe(false);
  });

  it("survives a summary past the 2,000-character cap", async () => {
    const result = await summarize({ ...wellFormed, summary: "word ".repeat(600) });
    expect(result.summary).not.toBeNull();
    expect(result.summary?.length).toBeLessThanOrEqual(2_000);
    expect(result.summary?.length).toBeGreaterThan(0);
  });

  it("survives 17 entities when the cap is 16", async () => {
    const result = await summarize({
      ...wellFormed,
      newFacts: Array.from({ length: 17 }, (_, index) => ({
        kind: "character",
        name: `Sailor ${index + 1}`,
        facts: [`Crews berth ${index + 1}`],
      })),
    });
    expect(result.newFacts).toHaveLength(16);
  });

  it("survives 9 facts for one entity when the cap is 8", async () => {
    const result = await summarize({
      ...wellFormed,
      newFacts: [
        {
          kind: "character",
          name: "Mira",
          facts: Array.from({ length: 9 }, (_, index) => `Fact ${index + 1}`),
        },
      ],
    });
    expect(result.newFacts[0].facts).toHaveLength(8);
  });

  it("survives 11 relationships when the cap is 10", async () => {
    const result = await summarize({
      ...wellFormed,
      relationships: Array.from({ length: 11 }, (_, index) => ({
        from: "Mira",
        to: `Sailor ${index + 1}`,
        type: "knows",
      })),
    });
    expect(result.relationships).toHaveLength(10);
  });

  it('survives entity kind "faction", which is in no enum the model was shown', async () => {
    const result = await summarize({
      ...wellFormed,
      newFacts: [{ kind: "faction", name: "The Tide Bargain", facts: ["Signed at the equinox"] }],
    });
    expect(["character", "location", "object", "organization", "event"]).toContain(
      result.newFacts[0].kind,
    );
    // The facts survive the unrecognized label rather than being thrown away.
    expect(result.newFacts[0].facts).toEqual(["Signed at the equinox"]);
  });

  it("survives a relationship description past its 300-character cap", async () => {
    const result = await summarize({
      ...wellFormed,
      relationships: [{ from: "Mira", to: "Kel", type: "sister_of", description: "x".repeat(400) }],
    });
    expect(result.relationships[0].description?.length).toBeLessThanOrEqual(300);
  });

  it("drops an unnamed entity delta rather than writing a nameless bible row", async () => {
    const result = await summarize({
      ...wellFormed,
      newFacts: [
        { kind: "character", facts: ["Storm-gray eyes"] },
        { kind: "character", name: "Mira", facts: ["Keeps the ledger"] },
      ],
    });
    expect(result.newFacts).toHaveLength(1);
    expect(result.newFacts[0].name).toBe("Mira");
  });

  it("drops a relationship missing one of its ends", async () => {
    const result = await summarize({
      ...wellFormed,
      relationships: [
        { from: "Mira", type: "sister_of" },
        { from: "Mira", to: "Kel", type: "sister_of" },
      ],
    });
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].to).toBe("Kel");
  });

  it("survives newFacts and relationships sent as null instead of empty lists", async () => {
    const result = await summarize({ ...wellFormed, newFacts: null, relationships: null });
    expect(result.newFacts).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.summary).toBe(wellFormed.summary);
  });

  it("survives a missing moderation verdict", async () => {
    const result = await summarize({ ...wellFormed, moderation: undefined });
    expect(result.moderation).toEqual({ flagged: false });
  });

  it('survives moderation flagged sent as the string "true"', async () => {
    const result = await summarize({
      ...wellFormed,
      moderation: { flagged: "true", category: "minors", reason: "Ambiguous age" },
    });
    expect(result.moderation.flagged).toBe(true);
    expect(result.moderation.category).toBe("minors");
  });

  it("maps an unrecognized moderation category onto other rather than dropping the flag", async () => {
    const result = await summarize({
      ...wellFormed,
      moderation: { flagged: true, category: "graphic_violence", reason: "Battlefield scene" },
    });
    expect(result.moderation.flagged).toBe(true);
    expect(result.moderation.category).toBe("other");
  });

  it("survives an answer that is not an object at all", async () => {
    const result = await summarize("The chapter went well.");
    expect(result.summary).toBeNull();
    expect(result.newFacts).toEqual([]);
  });

  /**
   * The outline writes a summary for every chapter before it is drafted, so a
   * summarizer answer that carries none is a thinner answer about a chapter
   * that already has one — never a reason to blank it.
   */
  it("reports a summary the model did not write as null, keeping the deltas", async () => {
    const result = await summarize({ ...wellFormed, summary: undefined });
    expect(result.summary).toBeNull();
    expect(result.newFacts).toHaveLength(2);
    expect(result.relationships).toHaveLength(1);
  });

  it("reports a whitespace-only summary as null too", async () => {
    expect((await summarize({ ...wellFormed, summary: "   " })).summary).toBeNull();
  });
});

/** Records what the persist tail would have written, without a database. */
function recordingTransaction() {
  const updates: Record<string, unknown>[] = [];
  const transaction = {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: async () => undefined };
      },
    }),
  };
  return { updates, transaction: transaction as unknown as DbTransaction };
}

const strictSummary = (over: Partial<ChapterSummary> = {}): ChapterSummary => ({
  summary: "Mira reaches the harbor and finds the ledger short by one hull.",
  newFacts: [{ kind: "character", name: "Mira", facts: ["Keeps the harbor ledger"] }],
  relationships: [{ from: "Mira", to: "Kel", type: "sister_of" }],
  moderation: { flagged: false },
  ...over,
});

describe("persistChapterSummary", () => {
  beforeEach(() => {
    vi.mocked(applyEntityDeltas).mockClear();
  });

  it("leaves the stored summary alone when the model returned none", async () => {
    const { updates, transaction } = recordingTransaction();

    await persistChapterSummary(summaryInput, strictSummary({ summary: null }), transaction);

    expect(updates).toEqual([]);
    // The entity deltas are a separate part of the same answer and still apply.
    expect(applyEntityDeltas).toHaveBeenCalledTimes(1);
    expect(vi.mocked(applyEntityDeltas).mock.calls[0][0].newFacts).toHaveLength(1);
  });

  it("writes the summary the model did return", async () => {
    const { updates, transaction } = recordingTransaction();

    await persistChapterSummary(summaryInput, strictSummary(), transaction);

    expect(updates).toHaveLength(1);
    expect(updates[0].summary).toBe(strictSummary().summary);
  });
});

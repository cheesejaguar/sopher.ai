import { beforeEach, describe, expect, it, vi } from "vitest";

import { conceptSchema, conceptWireSchema, type BookConcept } from "@/ai/schemas";

type MockedSchema = { safeParse: (value: unknown) => { success: boolean; data?: unknown } };

const mocks = vi.hoisted(() => ({
  answers: [] as unknown[],
  calls: [] as { prompt: string; schema: unknown }[],
}));

/**
 * Stands in for the SDK's structured-output path: it validates the provider's
 * answer against whatever schema the agent handed it and fails the call when
 * the answer does not fit — which is exactly how a plausible answer became
 * NoObjectGeneratedError in production.
 */
vi.mock("ai", () => ({
  generateText: vi.fn(async (options: { prompt?: unknown; output?: { schema?: unknown } }) => {
    mocks.calls.push({ prompt: String(options.prompt ?? ""), schema: options.output?.schema });
    if (mocks.answers.length === 0) throw new Error("No mocked concept answer remains");
    const answer = mocks.answers.shift();
    const parsed = (options.output?.schema as MockedSchema).safeParse(answer);
    if (!parsed.success) {
      throw new Error("No object generated: response did not match the requested schema");
    }
    return { output: parsed.data };
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

import { generateConcept, type ConceptCtx } from "./concept";

function conceptInput(over: Partial<ConceptCtx> = {}): ConceptCtx {
  return {
    meter: { userId: "user-1", projectId: "project-1", runId: "run-1" },
    tools: { userId: "user-1", projectId: "project-1", bookId: "book-1" },
    tier: "standard",
    brief: "A cartographer follows a river that has vanished from every map.",
    genre: "literary fiction",
    ...over,
  };
}

/** A model answer that fits every cap — the case that never needed salvage. */
const wellFormed = {
  title: "The Map of Tides",
  logline: "A cartographer follows a river that has vanished from every map.",
  synopsis: "Mara crosses a flooded country to restore the river and the towns erased with it.",
  themes: ["memory", "belonging"],
  setting: "A coast whose waterways move at night",
  centralConflict: "Restoring the river will expose who profited from its disappearance.",
  uniqueElements: ["living maps"],
  characters: [
    {
      name: "Mara Venn",
      role: "protagonist",
      description: "A stubborn harbor cartographer",
      arc: "Learns that accuracy without courage preserves the wrong story",
    },
  ],
  moderation: { flagged: false },
};

const strictConcept: BookConcept = conceptSchema.parse(wellFormed);

/**
 * Every key present, nothing in any of them — the shape a half-answer takes
 * once the provider's own validation has been satisfied. Bounds are stripped
 * from the schema the model is shown, so blank is the one partial answer the
 * wire schema cannot catch.
 */
const blankProse = {
  ...wellFormed,
  title: " ",
  logline: "",
  synopsis: "   ",
  setting: "",
  centralConflict: "",
};

/** A field the model simply did not answer — absent, not null. */
function without(answer: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...answer };
  delete copy[key];
  return copy;
}

const themes = (count: number) => Array.from({ length: count }, (_, i) => `Theme ${i + 1}`);
const elements = (count: number) => Array.from({ length: count }, (_, i) => `Element ${i + 1}`);
const cast = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    name: `Character ${i + 1}`,
    role: "supporting",
    description: `Description ${i + 1}`,
    arc: `Arc ${i + 1}`,
  }));

/** Runs both passes over the same answer and holds the result to the strict type. */
async function concept(expandAnswer: unknown, refineAnswer: unknown = expandAnswer) {
  mocks.answers.push(expandAnswer, refineAnswer);
  const result = await generateConcept(conceptInput());
  expect(conceptSchema.safeParse(result).success).toBe(true);
  return result;
}

beforeEach(() => {
  mocks.answers.length = 0;
  mocks.calls.length = 0;
});

/**
 * Anthropic's structured-output path strips `.max` from the schema the model is
 * shown, so every over-cap answer below is one the model had no way to know was
 * over a cap. Before the wire schema, each one threw NoObjectGeneratedError,
 * retried to the identical answer at full cost, and failed the run at its very
 * first paid step — the author's brief expansion, discarded.
 */
describe("generateConcept", () => {
  it("hands the provider the permissive wire schema on both the expand and the refine call", async () => {
    await concept(wellFormed);
    expect(mocks.calls).toHaveLength(2);
    expect(mocks.calls[0].schema).toBe(conceptWireSchema);
    expect(mocks.calls[1].schema).toBe(conceptWireSchema);
  });

  it("keeps a well-formed answer intact", async () => {
    const result = await concept(wellFormed);
    expect(result).toEqual(strictConcept);
  });

  it("survives 8 themes when the cap is 6", async () => {
    const result = await concept({ ...wellFormed, themes: themes(8) });
    expect(result.themes).toEqual(themes(8).slice(0, 6));
  });

  it("survives 7 unique elements when the cap is 5", async () => {
    const result = await concept({ ...wellFormed, uniqueElements: elements(7) });
    expect(result.uniqueElements).toHaveLength(5);
  });

  it("survives a 12-character cast when the cap is 10, keeping the first ten", async () => {
    const result = await concept({ ...wellFormed, characters: cast(12) });
    expect(result.characters).toHaveLength(10);
    expect(result.characters[0].name).toBe("Character 1");
  });

  it("salvages the refine pass too, so an over-cap refine cannot discard a paid expansion", async () => {
    mocks.answers.push({ ...wellFormed, themes: themes(9) });
    const result = await generateConcept(conceptInput(), { expanded: strictConcept });

    expect(mocks.calls).toHaveLength(1);
    expect(mocks.calls[0].schema).toBe(conceptWireSchema);
    expect(result.themes).toHaveLength(6);
    expect(conceptSchema.safeParse(result).success).toBe(true);
  });

  it("survives an omitted uniqueElements array rather than losing the concept", async () => {
    const result = await concept(without(wellFormed, "uniqueElements"));
    expect(result.uniqueElements).toEqual([]);
    expect(result.logline).toBe(wellFormed.logline);
  });

  it("survives an omitted moderation verdict as an unflagged one", async () => {
    const result = await concept(without(wellFormed, "moderation"));
    expect(result.moderation).toEqual({ flagged: false });
  });

  it("drops a nameless character instead of failing the whole concept", async () => {
    const result = await concept({
      ...wellFormed,
      characters: [...wellFormed.characters, { role: "antagonist", description: "", arc: "" }],
    });
    expect(result.characters).toHaveLength(1);
    expect(result.characters[0].name).toBe("Mara Venn");
  });

  it("still preserves the author's working title through normalization", async () => {
    mocks.answers.push({ ...wellFormed, themes: themes(8) }, { ...wellFormed, themes: themes(8) });
    const result = await generateConcept(conceptInput({ workingTitle: "Saltwater Almanac" }));
    expect(result.title).toBe("Saltwater Almanac");
    expect(result.themes).toHaveLength(6);
  });

  /**
   * The refine pass rewrites the concept wholesale, so a partial answer there
   * replaces a complete one. Two mechanisms guard it, and they catch different
   * halves of the same problem: the wire schema still requires the prose keys,
   * which is the only constraint the provider enforces, and the viability floor
   * catches the keys that arrive empty, which it cannot. Neither ever costs the
   * expansion — a missing key retries the step from the checkpointed expansion,
   * and an empty one keeps it, because re-asking buys the same answer.
   */
  it("keeps the checkpointed expansion when the refine pass answers with blanks", async () => {
    const onRefined = vi.fn();
    mocks.answers.push(blankProse);

    const result = await generateConcept(conceptInput(), {
      expanded: strictConcept,
      onRefined,
    });

    expect(result).toEqual(strictConcept);
    // The staged concept must be the one we return, or a resume would pick the
    // blank answer back up.
    expect(onRefined).toHaveBeenCalledWith(strictConcept);
  });

  it("keeps the expansion when the refine drops the cast the story bible is seeded from", async () => {
    mocks.answers.push({ ...wellFormed, characters: [] });

    const result = await generateConcept(conceptInput(), { expanded: strictConcept });

    expect(result.characters).toEqual(strictConcept.characters);
  });

  it("retries rather than accepting a refine answer that omitted a prose field", async () => {
    mocks.answers.push(without(wellFormed, "logline"));

    await expect(generateConcept(conceptInput(), { expanded: strictConcept })).rejects.toThrow(
      /did not match the requested schema/,
    );
  });

  it("fails the expand pass rather than returning a concept with nothing in it", async () => {
    mocks.answers.push(blankProse);

    const thrown = (await generateConcept(conceptInput()).catch(
      (error: unknown) => error,
    )) as Error;

    expect(thrown.message).toBe("Concept expansion returned no usable concept");
    // The message crosses the step boundary into a persisted run failure, so it
    // must carry no provider output.
    expect(thrown.message).not.toContain(wellFormed.characters[0].name);
    expect(mocks.calls).toHaveLength(1);
  });

  it("checkpoints the salvaged concept, not the raw answer", async () => {
    const onExpanded = vi.fn();
    const onRefined = vi.fn();
    mocks.answers.push({ ...wellFormed, characters: cast(12) }, wellFormed);

    await generateConcept(conceptInput(), { onExpanded, onRefined });

    const expanded = onExpanded.mock.calls[0][0] as BookConcept;
    expect(conceptSchema.safeParse(expanded).success).toBe(true);
    expect(expanded.characters).toHaveLength(10);
    expect(conceptSchema.safeParse(onRefined.mock.calls[0][0]).success).toBe(true);
  });
});

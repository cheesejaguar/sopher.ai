import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  conceptSchema,
  creativeQuestionSchema,
  creativeQuestionWireSchema,
  type BookConcept,
} from "@/ai/schemas";

type MockedSchema = { safeParse: (value: unknown) => { success: boolean; data?: unknown } };

const mocks = vi.hoisted(() => ({
  answers: [] as unknown[],
  calls: [] as { prompt: string; schema: unknown }[],
}));

/**
 * Stands in for the SDK's structured-output path: it validates the provider's
 * answer against whatever schema the agent handed it and fails the call when
 * the answer does not fit. `creative.question` is one of the two calls that
 * actually failed this way in production.
 */
vi.mock("ai", () => ({
  generateText: vi.fn(async (options: { prompt?: unknown; output?: { schema?: unknown } }) => {
    mocks.calls.push({ prompt: String(options.prompt ?? ""), schema: options.output?.schema });
    if (mocks.answers.length === 0) throw new Error("No mocked creative answer remains");
    const answer = mocks.answers.shift();
    const parsed = (options.output?.schema as MockedSchema).safeParse(answer);
    if (!parsed.success) {
      throw new Error("No object generated: response did not match the requested schema");
    }
    return { output: parsed.data };
  }),
  Output: { object: vi.fn(({ schema }: { schema: unknown }) => ({ schema })) },
}));

vi.mock("@/ai/metering", () => ({
  gatewayOptions: vi.fn(() => ({})),
  metered: vi.fn(
    async (_meter: unknown, _info: unknown, run: () => Promise<unknown>) => await run(),
  ),
}));

import { generateCreativeQuestion } from "./creative-director";

const concept: BookConcept = conceptSchema.parse({
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
});

const input = {
  meter: { userId: "user-1", projectId: "project-1", runId: "run-1" },
  tier: "standard" as const,
  concept,
  brief: "A cartographer follows a river that has vanished from every map.",
  genre: "literary fiction",
};

const option = (index: number) => ({
  id: `option-${index}`,
  label: `Direction ${index}`,
  description: `The story takes shape around choice ${index} and its consequences.`,
});

const wellFormed = {
  question: "Should Mara restore the river, or let the coast remember it as a story?",
  rationale: "This decides whether the ending is a repair or an elegy.",
  options: [option(1), option(2), option(3)],
  recommendedOptionId: "option-2",
};

/** A field the model simply did not answer — absent, not null. */
function without(answer: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...answer };
  delete copy[key];
  return copy;
}

async function ask(answer: unknown) {
  mocks.answers.push(answer);
  const question = await generateCreativeQuestion(input);
  if (question !== null) {
    // Whatever the model said, the caller keeps the strict domain type.
    expect(creativeQuestionSchema.safeParse(question).success).toBe(true);
  }
  return question;
}

beforeEach(() => {
  mocks.answers.length = 0;
  mocks.calls.length = 0;
});

/**
 * Anthropic's structured-output path does not enforce the option-id enum and
 * strips every length bound, so each answer below is one the model was never
 * shown a rule against. Before the wire schema they threw at
 * `creativeQuestionSchema.parse`, surfaced as "creative.question ended before a
 * complete result was available", and cost the author a paid call for nothing.
 */
describe("generateCreativeQuestion", () => {
  it("hands the provider the permissive wire schema, not the strict one", async () => {
    await ask(wellFormed);
    expect(mocks.calls).toHaveLength(1);
    expect(mocks.calls[0].schema).toBe(creativeQuestionWireSchema);
  });

  it("keeps a well-formed answer intact", async () => {
    const question = await ask(wellFormed);
    expect(question?.question).toBe(wellFormed.question);
    expect(question?.options.map((o) => o.id)).toEqual(["option-1", "option-2", "option-3"]);
    expect(question?.recommendedOptionId).toBe("option-2");
  });

  it('survives ids of "1", "2", "3" and still recommends the option the model picked', async () => {
    const question = await ask({
      ...wellFormed,
      options: wellFormed.options.map((o, index) => ({ ...o, id: String(index + 1) })),
      recommendedOptionId: "3",
    });
    expect(question?.options.map((o) => o.id)).toEqual(["option-1", "option-2", "option-3"]);
    expect(question?.recommendedOptionId).toBe("option-3");
    expect(question?.options[2].label).toBe("Direction 3");
  });

  it('survives duplicate ids — three "option-1"s — by reassigning them positionally', async () => {
    const question = await ask({
      ...wellFormed,
      options: wellFormed.options.map((o) => ({ ...o, id: "option-1" })),
    });
    expect(question?.options.map((o) => o.id)).toEqual(["option-1", "option-2", "option-3"]);
    expect(question?.options.map((o) => o.label)).toEqual([
      "Direction 1",
      "Direction 2",
      "Direction 3",
    ]);
  });

  it("survives a fourth option when exactly three were asked for", async () => {
    const question = await ask({ ...wellFormed, options: [...wellFormed.options, option(4)] });
    expect(question?.options).toHaveLength(3);
    expect(question?.options.map((o) => o.label)).not.toContain("Direction 4");
  });

  it("survives a label past 80 characters by truncating rather than rejecting", async () => {
    const longLabel = `Restore the river ${"and every drowned town along it ".repeat(4)}`;
    const question = await ask({
      ...wellFormed,
      options: [{ ...option(1), label: longLabel }, option(2), option(3)],
    });
    expect(question?.options[0].label.length).toBeLessThanOrEqual(80);
    expect(question?.options[0].label.startsWith("Restore the river")).toBe(true);
  });

  it("survives a question past 240 characters", async () => {
    const question = await ask({
      ...wellFormed,
      question: `Should Mara restore the river ${"or leave the coast to its own memory ".repeat(8)}?`,
    });
    expect((question?.question.length ?? 0) <= 240).toBe(true);
  });

  it("survives a missing rationale with a neutral line instead of losing the question", async () => {
    const question = await ask(without(wellFormed, "rationale"));
    expect(question?.rationale.length).toBeGreaterThan(0);
    expect(question?.options).toHaveLength(3);
  });

  it("survives a recommendation that names no option by recommending the first", async () => {
    const question = await ask({ ...wellFormed, recommendedOptionId: "the second one" });
    expect(question?.recommendedOptionId).toBe("option-1");
  });

  /**
   * Null is the already-supported "no question" outcome: the workflow outlines
   * straight from the concept. It must not throw — a throw would be retried
   * into the identical answer at the author's expense.
   */
  it("returns null, without a second call, when only two options are usable", async () => {
    const question = await ask({
      ...wellFormed,
      options: [option(1), { id: "option-2", label: "", description: "" }, option(3)],
    });
    expect(question).toBeNull();
    expect(mocks.calls).toHaveLength(1);
  });

  it("returns null when the answer carries no question at all", async () => {
    const question = await ask({ ...wellFormed, question: "  " });
    expect(question).toBeNull();
  });

  it("returns null rather than throwing when the provider answers with nothing usable", async () => {
    const question = await ask({});
    expect(question).toBeNull();
    expect(mocks.calls).toHaveLength(1);
  });
});

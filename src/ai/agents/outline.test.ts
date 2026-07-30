import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookConcept, BookOutline } from "@/ai/schemas";

const mocks = vi.hoisted(() => ({
  outputs: [] as unknown[],
  prompts: [] as string[],
  calls: 0,
}));

vi.mock("ai", () => ({
  generateText: vi.fn(async ({ prompt }: { prompt?: unknown }) => {
    mocks.calls += 1;
    mocks.prompts.push(String(prompt ?? ""));
    const output = mocks.outputs.shift();
    if (output === undefined) throw new Error("No mocked outline output remains");
    return { output };
  }),
  Output: {
    object: vi.fn(({ schema }: { schema: unknown }) => ({ schema })),
  },
}));

vi.mock("@/ai/metering", () => ({
  gatewayOptions: vi.fn(() => ({})),
  metered: vi.fn(async (_ctx: unknown, _info: unknown, run: () => Promise<unknown>) => await run()),
}));

import { generateOutline, outlineSchemaForRun, type OutlineInput } from "./outline";

const concept: BookConcept = {
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

function outline(chapterCount: number, targetWords = 2_000): BookOutline {
  return {
    title: "The Map of Tides",
    logline: concept.logline,
    synopsis: concept.synopsis,
    themes: concept.themes,
    plotStructure: "three_act",
    chapters: Array.from({ length: chapterCount }, (_, index) => ({
      number: index + 1,
      title: `Chapter ${index + 1}`,
      summary: `Mara advances through stage ${index + 1} of the journey.`,
      keyEvents: [`Event ${index + 1}`],
      charactersPresent: ["Mara Venn"],
      emotionalArc:
        index === chapterCount - 2
          ? ("climax" as const)
          : index === chapterCount - 1
            ? ("resolution" as const)
            : ("rising_action" as const),
      openingHook: `Opening ${index + 1}`,
      closingHook: `Closing ${index + 1}`,
      targetWords,
    })),
  };
}

function plan(chapterCount: number) {
  const midpoint = Math.max(1, Math.floor(chapterCount / 2));
  return {
    plotStructure: "three_act",
    acts: [
      { name: "Departure", startChapter: 1, endChapter: midpoint, arc: "The river calls." },
      {
        name: "Return",
        startChapter: midpoint + 1,
        endChapter: chapterCount,
        arc: "The buried truth surfaces.",
      },
    ],
  };
}

function input(tier: OutlineInput["tier"]): OutlineInput {
  return {
    meter: { userId: "user-1", projectId: "project-1", runId: "run-1" },
    tools: { userId: "user-1", projectId: "project-1", bookId: "book-1" },
    tier,
    concept,
    chapterCount: 5,
    targetWordsPerChapter: 2_000,
  };
}

beforeEach(() => {
  mocks.outputs = [];
  mocks.prompts = [];
  mocks.calls = 0;
});

describe("outlineSchemaForRun", () => {
  const schema = outlineSchemaForRun(5, 2_000);

  it("rejects an under-count outline", () => {
    expect(schema.safeParse(outline(4)).success).toBe(false);
  });

  it("rejects an over-count outline", () => {
    expect(schema.safeParse(outline(6)).success).toBe(false);
  });

  it("rejects chapter targets outside the run's twenty-percent range", () => {
    const tooShort = outline(5);
    tooShort.chapters[2].targetWords = 1_599;
    const tooLong = outline(5);
    tooLong.chapters[2].targetWords = 2_401;

    expect(schema.safeParse(tooShort).success).toBe(false);
    expect(schema.safeParse(tooLong).success).toBe(false);
    expect(schema.safeParse(outline(5, 1_600)).success).toBe(true);
    expect(schema.safeParse(outline(5, 2_400)).success).toBe(true);
  });
});

describe("generateOutline production-shape enforcement", () => {
  it("continues from paid plan/draft checkpoints instead of repeating calls", async () => {
    const onFinal = vi.fn();
    const result = await generateOutline(input("draft"), {
      checkpoint: { plan: plan(5), draft: outline(5) },
      onFinal,
    });

    expect(result.chapters).toHaveLength(5);
    expect(mocks.calls).toBe(0);
    expect(onFinal).toHaveBeenCalledOnce();
  });

  it("repairs invalid production shape even on the draft tier", async () => {
    mocks.outputs = [plan(5), outline(4), outline(5)];

    const result = await generateOutline(input("draft"));

    expect(result.chapters).toHaveLength(5);
    expect(mocks.calls).toBe(3);
  });

  it("carries the frozen authoring constraints into planning and every chapter outline", async () => {
    mocks.outputs = [plan(5), outline(5)];
    const constrainedInput = {
      ...input("draft"),
      contentGuidelines:
        "Point of view: first person.\nMaximum violence: mild.\nAvoid: animal harm.",
    };

    await generateOutline(constrainedInput);

    expect(mocks.prompts).toHaveLength(2);
    expect(mocks.prompts[0]).toContain("## Authoring constraints");
    expect(mocks.prompts[0]).toContain("Point of view: first person.");
    expect(mocks.prompts[1]).toContain("## Authoring constraints (must hold in every chapter)");
    expect(mocks.prompts[1]).toContain("Maximum violence: mild.");
    expect(mocks.prompts[1]).toContain("Avoid: animal harm.");
  });

  it("carries the frozen contract into the third-call shape repair prompt", async () => {
    mocks.outputs = [plan(5), outline(4), outline(5)];
    const constrainedInput = {
      ...input("draft"),
      contentGuidelines:
        "Voice profile: immersive.\nPoint of view: first person.\nDo not introduce animal harm.",
    };

    await generateOutline(constrainedInput);

    expect(mocks.prompts).toHaveLength(3);
    expect(mocks.prompts[2]).toContain("## Frozen authoring contract");
    expect(mocks.prompts[2]).toContain("Voice profile: immersive.");
    expect(mocks.prompts[2]).toContain("Do not introduce animal harm.");
  });

  it("rejects a repaired result that still violates the run shape", async () => {
    mocks.outputs = [plan(5), outline(5, 1_500), outline(5, 1_500)];

    await expect(generateOutline(input("standard"))).rejects.toThrow(/>=1600/i);
    expect(mocks.calls).toBe(3);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REVIEW_PHASE_OUTPUT_CONTRACT,
  REVIEW_PHASES,
  continuityPhaseKeys,
} from "@/ai/prompts/review-rubric";
import { reviewPhaseResultSchema, reviewPhaseResultWireSchema } from "@/ai/schemas";
import type { ReviewPhaseResult } from "@/ai/schemas";

const mocks = vi.hoisted(() => ({
  outputs: [] as unknown[],
  calls: [] as { prompt: string; schema: unknown }[],
  getDb: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(async (options: { prompt?: unknown; output?: { schema?: unknown } }) => {
    mocks.calls.push({ prompt: String(options.prompt ?? ""), schema: options.output?.schema });
    if (mocks.outputs.length === 0) throw new Error("No mocked continuity output remains");
    return { output: mocks.outputs.shift() };
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

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: mocks.getDb,
}));

import {
  CONTINUITY_UNSCORED_RECOMMENDATION,
  aggregateContinuityOutcomes,
  isContinuityReportUnscored,
  runContinuityPhase,
  type ContinuityOutcome,
} from "./continuity";

function outcome(
  key: ContinuityOutcome["key"],
  weight: number,
  score: number,
  issues: ReviewPhaseResult["issues"] = [],
): ContinuityOutcome {
  return {
    key,
    weight,
    result: { score, summary: `${key} summary`, strengths: [], issues },
  };
}

const issue = (
  over: Partial<ReviewPhaseResult["issues"][number]>,
): ReviewPhaseResult["issues"][number] => ({
  chapters: [3],
  category: "character",
  severity: "major",
  description: "Mira's eye color changes between scenes",
  suggestedFix: "Pick storm-gray and keep it",
  ...over,
});

describe("continuityPhaseKeys", () => {
  it("runs only the technical phase on draft tier", () => {
    expect(continuityPhaseKeys("draft")).toEqual(["technical_consistency"]);
  });

  it("runs all six rubric phases on standard and premium", () => {
    for (const tier of ["standard", "premium"] as const) {
      expect(continuityPhaseKeys(tier)).toEqual(REVIEW_PHASES.map((p) => p.key));
    }
  });
});

describe("aggregateContinuityOutcomes", () => {
  it("weights scores and renormalizes over the phases actually run", () => {
    const report = aggregateContinuityOutcomes([
      outcome("narrative_structure", 0.2, 0.9),
      outcome("technical_consistency", 0.15, 0.6),
    ]);
    // (0.9*0.2 + 0.6*0.15) / 0.35
    expect(report.score).toBeCloseTo(0.7714, 3);
    expect(report.recommendation.length).toBeGreaterThan(0);
    expect(report.phases).toHaveLength(2);
    expect(report.unscored).toBeUndefined();
    expect(isContinuityReportUnscored(report)).toBe(false);
  });

  it("dedupes the same finding across phases, keeping the highest severity", () => {
    const report = aggregateContinuityOutcomes([
      outcome("character_development", 0.2, 0.8, [issue({ severity: "minor" })]),
      outcome("technical_consistency", 0.15, 0.7, [issue({ severity: "critical" })]),
    ]);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].severity).toBe("critical");
  });

  it("keeps distinct findings and ranks worst chapters by critical/major frequency", () => {
    const report = aggregateContinuityOutcomes([
      outcome("plot" as never, 0.2, 0.5, [
        issue({ chapters: [7], description: "The tide bargain terms contradict chapter one" }),
        issue({
          chapters: [7],
          category: "timeline",
          description: "Three days pass but the equinox date never moves",
        }),
        issue({
          chapters: [2],
          category: "setting",
          severity: "minor",
          description: "Harbor renamed mid-book",
        }),
      ]),
    ]);
    expect(report.issues).toHaveLength(3);
    expect(report.worstChapters[0]).toBe(7);
    expect(report.worstChapters).not.toContain(2);
  });

  /**
   * A review that never ran is not a review that found a worthless book. The
   * old zero rendered as "requires substantial rework" on a finished, edited
   * manuscript whose only fault was that the optional review was skipped.
   */
  it("marks the empty case unscored instead of passing a zero off as a verdict", () => {
    const report = aggregateContinuityOutcomes([]);
    expect(report.unscored).toBe(true);
    expect(isContinuityReportUnscored(report)).toBe(true);
    expect(report.recommendation).toBe(CONTINUITY_UNSCORED_RECOMMENDATION);
    expect(report.recommendation).not.toContain("substantial rework");
    expect(report.issues).toEqual([]);
    expect(report.worstChapters).toEqual([]);
  });

  it("recognizes a stored report from before the flag existed by its empty phase list", () => {
    expect(isContinuityReportUnscored({ phases: [] })).toBe(true);
    expect(
      isContinuityReportUnscored({
        phases: [{ key: "technical_consistency", score: 0.4, summary: "Thin timeline." }],
      }),
    ).toBe(false);
  });
});

/**
 * Every case below is a real answer the model gave, or would plausibly give,
 * to the continuity phase prompt. Anthropic's structured-output path strips
 * numeric and length bounds from the schema it shows the model, so it never
 * sees the caps it is being held to; before normalization each of these threw
 * NoObjectGeneratedError, was retried identically four times at full cost, and
 * failed a run whose manuscript was already written and edited.
 */
describe("runContinuityPhase", () => {
  const phaseInput = {
    meter: { userId: "user_1", projectId: "proj_1", runId: "run_1" },
    tools: { userId: "user_1", projectId: "proj_1", bookId: "book_1" },
    tier: "standard" as const,
  };

  const wellFormed = {
    score: 0.82,
    summary: "The spine holds; the middle drifts.",
    strengths: ["Confident opening"],
    issues: [
      {
        chapters: [3],
        category: "timeline",
        severity: "major",
        description: "Three days pass but the equinox date never moves",
        suggestedFix: "Move the equinox to the fourth day",
      },
    ],
  };

  const manyIssues = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      chapters: [index + 1],
      category: "plot",
      severity: "minor",
      description: `Loose thread ${index + 1}`,
      suggestedFix: `Tie off thread ${index + 1}`,
    }));

  beforeEach(() => {
    mocks.outputs.length = 0;
    mocks.calls.length = 0;
    const rows = [
      { chapterNumber: 1, title: "The Salt Ledger", summary: "Mira reaches the harbor." },
    ];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    mocks.getDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from }) });
  });

  async function phaseResult(modelOutput: unknown) {
    mocks.outputs.push(modelOutput);
    const result = await runContinuityPhase(phaseInput, "narrative_structure");
    // Whatever the model said, downstream keeps the strict domain type.
    expect(reviewPhaseResultSchema.safeParse(result.result).success).toBe(true);
    return result;
  }

  it("hands the provider the permissive wire schema, not the strict one", async () => {
    await phaseResult(wellFormed);
    expect(mocks.calls[0].schema).toBe(reviewPhaseResultWireSchema);
  });

  it("carries exactly one output contract into the request", async () => {
    await phaseResult(wellFormed);
    const prompt = mocks.calls[0].prompt;
    expect(prompt).toContain(REVIEW_PHASE_OUTPUT_CONTRACT);
    expect(prompt.split("## Result format")).toHaveLength(2);
    expect(prompt).not.toContain("Ignore the JSON template above");
    expect(prompt).not.toContain("Provide your analysis in JSON format");
  });

  it("keeps a well-formed answer intact", async () => {
    const result = await phaseResult(wellFormed);
    expect(result.key).toBe("narrative_structure");
    expect(result.weight).toBe(0.2);
    expect(result.result.score).toBeCloseTo(0.82, 5);
    expect(result.result.issues).toHaveLength(1);
  });

  it("survives 11 issues when the cap is 10", async () => {
    const result = await phaseResult({ ...wellFormed, issues: manyIssues(11) });
    expect(result.result.issues).toHaveLength(10);
  });

  it("survives 7 strengths when the cap is 6", async () => {
    const result = await phaseResult({
      ...wellFormed,
      strengths: Array.from({ length: 7 }, (_, index) => `Strength ${index + 1}`),
    });
    expect(result.result.strengths).toHaveLength(6);
  });

  it("survives a 0-100 score reported as 85", async () => {
    const result = await phaseResult({ ...wellFormed, score: 85 });
    expect(result.result.score).toBeCloseTo(0.85, 5);
  });

  it("survives 11 chapters cited in one issue when the cap is 10", async () => {
    const result = await phaseResult({
      ...wellFormed,
      issues: [{ ...wellFormed.issues[0], chapters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
    });
    expect(result.result.issues[0].chapters).toHaveLength(10);
  });

  it('survives severity "high", which is in no enum the model was shown', async () => {
    const result = await phaseResult({
      ...wellFormed,
      issues: [{ ...wellFormed.issues[0], severity: "high" }],
    });
    expect(["critical", "major", "minor"]).toContain(result.result.issues[0].severity);
  });

  it('survives category "pacing", which the phase checklist itself invites', async () => {
    const result = await phaseResult({
      ...wellFormed,
      issues: [{ ...wellFormed.issues[0], category: "pacing" }],
    });
    expect(["character", "timeline", "setting", "plot", "factual"]).toContain(
      result.result.issues[0].category,
    );
  });

  it('survives a chapter number sent as the string "3"', async () => {
    const result = await phaseResult({
      ...wellFormed,
      issues: [{ ...wellFormed.issues[0], chapters: ["3"] }],
    });
    expect(result.result.issues[0].chapters).toEqual([3]);
  });

  it("aggregates a salvaged phase into a real report rather than an unscored one", async () => {
    const result = await phaseResult({ ...wellFormed, score: 85, issues: manyIssues(11) });
    const report = aggregateContinuityOutcomes([result]);
    expect(report.unscored).toBeUndefined();
    expect(report.score).toBeCloseTo(0.85, 5);
    expect(report.issues.length).toBeGreaterThan(0);
  });
});

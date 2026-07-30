import { describe, expect, it } from "vitest";
import { aggregateContinuityOutcomes, type ContinuityOutcome } from "./continuity";
import { REVIEW_PHASES, continuityPhaseKeys } from "@/ai/prompts/review-rubric";
import type { ReviewPhaseResult } from "@/ai/schemas";

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

  it("returns zero score for no outcomes", () => {
    const report = aggregateContinuityOutcomes([]);
    expect(report.score).toBe(0);
    expect(report.issues).toEqual([]);
    expect(report.worstChapters).toEqual([]);
  });
});

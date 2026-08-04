import { describe, expect, it } from "vitest";

import {
  REVIEW_PHASES,
  REVIEW_PHASES_BY_KEY,
  REVIEW_PHASE_OUTPUT_CONTRACT,
  buildReviewPhasePrompt,
  buildReviewUserPrompt,
  scoreToRecommendation,
  type ReviewPhaseKey,
} from "./review-rubric";

/** Field names from the per-phase JSON templates that used to ship in the prompt. */
const RETIRED_TEMPLATE_FIELDS = [
  "specific_issues",
  "characters_analyzed",
  "notable_passages",
  "identified_themes",
  "thematic_moments",
  "timeline_valid",
  "continuity_errors",
  "world_building_issues",
  "factual_concerns",
  "engagement_level",
  "emotional_moments",
  "target_audience",
  "weaknesses",
];

const EXPECTED_WEIGHTS: Record<ReviewPhaseKey, number> = {
  narrative_structure: 0.2,
  character_development: 0.2,
  writing_quality: 0.2,
  thematic_elements: 0.15,
  technical_consistency: 0.15,
  reader_experience: 0.1,
};

describe("REVIEW_PHASES", () => {
  it("contains the six phases in original order with correct weights", () => {
    expect(REVIEW_PHASES.map((p) => p.key)).toEqual([
      "narrative_structure",
      "character_development",
      "writing_quality",
      "thematic_elements",
      "technical_consistency",
      "reader_experience",
    ]);
    for (const phase of REVIEW_PHASES) {
      expect(phase.weight).toBe(EXPECTED_WEIGHTS[phase.key]);
      expect(phase.weight).toBeGreaterThan(0);
      expect(phase.weight).toBeLessThanOrEqual(1);
    }
  });

  it("weights sum to 1.0", () => {
    const total = REVIEW_PHASES.reduce((sum, p) => sum + p.weight, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });

  it("every phase has a reviewer prompt with a numbered checklist", () => {
    for (const phase of REVIEW_PHASES) {
      expect(phase.prompt).toContain("You are a professional literary reviewer");
      expect(phase.prompt).toContain("Analyze this manuscript for:");
      expect(phase.prompt).toMatch(/1\. \*\*/);
      expect(phase.prompt).toMatch(/5\. \*\*/); // every checklist has at least 5 items
      expect(phase.name.length).toBeGreaterThan(0);
      expect(phase.description.length).toBeGreaterThan(0);
    }
  });

  it("preserves phase-specific checklist items", () => {
    expect(REVIEW_PHASES_BY_KEY.narrative_structure.prompt).toContain("**Plot Coherence**");
    expect(REVIEW_PHASES_BY_KEY.character_development.prompt).toContain(
      "three-dimensional or like cardboard cutouts",
    );
    expect(REVIEW_PHASES_BY_KEY.writing_quality.prompt).toContain(
      "vivid without being purple prose",
    );
    expect(REVIEW_PHASES_BY_KEY.thematic_elements.prompt).toContain("without being heavy-handed");
    expect(REVIEW_PHASES_BY_KEY.technical_consistency.prompt).toContain("**Timeline Coherence**");
    expect(REVIEW_PHASES_BY_KEY.reader_experience.prompt).toContain(
      "Would you recommend this book? To whom?",
    );
  });

  it("carries no per-phase output template", () => {
    for (const phase of REVIEW_PHASES) {
      for (const field of RETIRED_TEMPLATE_FIELDS) {
        expect(phase.prompt).not.toContain(field);
      }
      expect(phase.prompt).not.toContain("JSON");
    }
  });
});

/**
 * The contract is the only place the model is told the shape of its answer,
 * and the only place it learns the caps and enums that Anthropic's structured
 * output strips out of the schema. Drift here is what the 2026-08-04 incident
 * cost a finished book.
 */
describe("REVIEW_PHASE_OUTPUT_CONTRACT", () => {
  it("names every field of reviewPhaseResultSchema", () => {
    for (const field of [
      "score",
      "summary",
      "strengths",
      "issues",
      "chapters",
      "category",
      "severity",
      "description",
      "suggestedFix",
    ]) {
      expect(REVIEW_PHASE_OUTPUT_CONTRACT).toContain(field);
    }
  });

  it("states the enum vocabularies the wire schema no longer carries", () => {
    expect(REVIEW_PHASE_OUTPUT_CONTRACT).toContain(
      "exactly one of character, timeline, setting, plot, factual",
    );
    expect(REVIEW_PHASE_OUTPUT_CONTRACT).toContain("exactly one of critical, major, minor");
  });

  it("states the caps and the 0-1 score scale that get stripped from the schema", () => {
    expect(REVIEW_PHASE_OUTPUT_CONTRACT).toContain("between 0.0 and 1.0");
    expect(REVIEW_PHASE_OUTPUT_CONTRACT).toContain("0.85, never 85");
    expect(REVIEW_PHASE_OUTPUT_CONTRACT).toContain("at most 6");
    expect(REVIEW_PHASE_OUTPUT_CONTRACT).toContain("at most 10 entries");
    expect(REVIEW_PHASE_OUTPUT_CONTRACT).toContain("at most 10 chapter numbers");
    expect(REVIEW_PHASE_OUTPUT_CONTRACT).toContain('written as numbers (3, not "3")');
  });
});

describe("buildReviewPhasePrompt", () => {
  it("joins the reviewer checklist to the one result contract", () => {
    const full = buildReviewPhasePrompt("narrative_structure");
    expect(full).toContain(
      "You are a professional literary reviewer evaluating narrative structure.",
    );
    expect(full).toContain(REVIEW_PHASE_OUTPUT_CONTRACT);
  });

  it("ships exactly one output contract per phase, with no rival JSON template", () => {
    for (const phase of REVIEW_PHASES) {
      const full = buildReviewPhasePrompt(phase.key);
      expect(full).not.toContain("Provide your analysis in JSON format");
      expect(full.split("## Result format")).toHaveLength(2);
      for (const field of RETIRED_TEMPLATE_FIELDS) {
        expect(full).not.toContain(field);
      }
    }
  });
});

describe("buildReviewUserPrompt", () => {
  it("wraps the manuscript with the review request", () => {
    expect(buildReviewUserPrompt("MANUSCRIPT")).toBe(
      "Please review this manuscript:\n\nMANUSCRIPT",
    );
  });
});

describe("scoreToRecommendation", () => {
  it("uses the 0.85 / 0.70 / 0.55 ladder with inclusive thresholds", () => {
    expect(scoreToRecommendation(1.0)).toBe(
      "This manuscript is publication-ready with minor polish needed.",
    );
    expect(scoreToRecommendation(0.85)).toBe(
      "This manuscript is publication-ready with minor polish needed.",
    );
    expect(scoreToRecommendation(0.8499)).toBe(
      "This manuscript shows strong potential and would benefit from targeted revisions.",
    );
    expect(scoreToRecommendation(0.7)).toBe(
      "This manuscript shows strong potential and would benefit from targeted revisions.",
    );
    expect(scoreToRecommendation(0.6999)).toBe(
      "This manuscript needs significant revision in several areas before publication.",
    );
    expect(scoreToRecommendation(0.55)).toBe(
      "This manuscript needs significant revision in several areas before publication.",
    );
    expect(scoreToRecommendation(0.5499)).toBe(
      "This manuscript requires substantial rework across multiple dimensions.",
    );
    expect(scoreToRecommendation(0)).toBe(
      "This manuscript requires substantial rework across multiple dimensions.",
    );
  });
});

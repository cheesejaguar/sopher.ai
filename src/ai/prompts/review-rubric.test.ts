import { describe, expect, it } from "vitest";

import {
  REVIEW_PHASES,
  REVIEW_PHASES_BY_KEY,
  buildReviewPhasePrompt,
  buildReviewUserPrompt,
  scoreToRecommendation,
  type ReviewPhaseKey,
} from "./review-rubric";

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

  it("every phase has a reviewer prompt with a numbered checklist and a JSON schema", () => {
    for (const phase of REVIEW_PHASES) {
      expect(phase.prompt).toContain("You are a professional literary reviewer");
      expect(phase.prompt).toContain("Analyze this manuscript for:");
      expect(phase.prompt).toMatch(/1\. \*\*/);
      expect(phase.prompt).toMatch(/5\. \*\*/); // every checklist has at least 5 items
      expect(phase.outputSchemaDescription).toContain('"score": <0.0-1.0>');
      expect(phase.outputSchemaDescription).toContain(
        '"summary": "2-3 sentence overall assessment"',
      );
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

  it("preserves phase-specific schema fields", () => {
    expect(REVIEW_PHASES_BY_KEY.character_development.outputSchemaDescription).toContain(
      '"characters_analyzed"',
    );
    expect(REVIEW_PHASES_BY_KEY.writing_quality.outputSchemaDescription).toContain(
      '"notable_passages"',
    );
    expect(REVIEW_PHASES_BY_KEY.thematic_elements.outputSchemaDescription).toContain(
      '"identified_themes"',
    );
    expect(REVIEW_PHASES_BY_KEY.technical_consistency.outputSchemaDescription).toContain(
      '"timeline_valid": true|false',
    );
    expect(REVIEW_PHASES_BY_KEY.reader_experience.outputSchemaDescription).toContain(
      '"engagement_level": "low|medium|high"',
    );
  });
});

describe("buildReviewPhasePrompt", () => {
  it("joins prompt and schema with the original JSON instruction", () => {
    const full = buildReviewPhasePrompt("narrative_structure");
    expect(full).toContain(
      "You are a professional literary reviewer evaluating narrative structure.",
    );
    expect(full).toContain("Provide your analysis in JSON format:\n{");
    expect(full.endsWith("}")).toBe(true);
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

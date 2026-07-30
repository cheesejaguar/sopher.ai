import { describe, expect, it } from "vitest";

import { CONCEPT_SYSTEM_PROMPT, buildConceptUserPrompt } from "./concept";

describe("CONCEPT_SYSTEM_PROMPT", () => {
  it("carries the role and all six development steps", () => {
    expect(CONCEPT_SYSTEM_PROMPT).toContain("expert book concept developer");
    expect(CONCEPT_SYSTEM_PROMPT).toContain("### 1. Identify Core Themes");
    expect(CONCEPT_SYSTEM_PROMPT).toContain("### 2. Define the Setting");
    expect(CONCEPT_SYSTEM_PROMPT).toContain("### 3. Establish Tone and Voice");
    expect(CONCEPT_SYSTEM_PROMPT).toContain("### 4. Identify Target Audience");
    expect(CONCEPT_SYSTEM_PROMPT).toContain("### 5. Develop Central Conflict");
    expect(CONCEPT_SYSTEM_PROMPT).toContain("### 6. Suggest Unique Elements");
  });

  it("specifies all response format fields", () => {
    for (const field of [
      "title",
      "genre",
      "themes",
      "setting",
      "time_period",
      "tone",
      "target_audience",
      "unique_elements",
      "central_conflict",
    ]) {
      expect(CONCEPT_SYSTEM_PROMPT).toContain(field);
    }
  });

  it("does not reference the old tool workflow", () => {
    expect(CONCEPT_SYSTEM_PROMPT).not.toContain("get_brief");
    expect(CONCEPT_SYSTEM_PROMPT).not.toContain("get_settings");
    expect(CONCEPT_SYSTEM_PROMPT).not.toContain("search_genre_conventions");
    expect(CONCEPT_SYSTEM_PROMPT).not.toContain("Tool Workflow");
  });
});

describe("buildConceptUserPrompt", () => {
  it("includes the brief and optional sections", () => {
    const prompt = buildConceptUserPrompt({
      brief: "A lighthouse keeper discovers a message in a bottle.",
      workingTitle: "The Last Light",
      genre: "mystery",
      targetAudience: "adult readers",
      contentGuidelines: "## Content Guidelines\nNo profanity.",
    });
    expect(prompt).toContain("A lighthouse keeper discovers a message in a bottle.");
    expect(prompt).toContain("## Working Title\n\nThe Last Light");
    expect(prompt).toContain("Preserve this title exactly");
    expect(prompt).toContain("## Genre\n\nmystery");
    expect(prompt).toContain("## Target Audience\n\nadult readers");
    expect(prompt).toContain("## Content Guidelines");
  });

  it("omits sections that are not provided", () => {
    const prompt = buildConceptUserPrompt({ brief: "Just a brief." });
    expect(prompt).toContain("Just a brief.");
    expect(prompt).not.toContain("## Genre");
    expect(prompt).not.toContain("## Target Audience");
  });
});

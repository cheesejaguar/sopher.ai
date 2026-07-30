import { describe, expect, it } from "vitest";

import { OUTLINE_SYSTEM_PROMPT, buildOutlineUserPrompt } from "./outline";

describe("OUTLINE_SYSTEM_PROMPT", () => {
  it("carries the role and all five outlining principles", () => {
    expect(OUTLINE_SYSTEM_PROMPT).toContain("expert book outliner and story architect");
    expect(OUTLINE_SYSTEM_PROMPT).toContain("### 1. Story Structure");
    expect(OUTLINE_SYSTEM_PROMPT).toContain("### 2. Chapter Pacing");
    expect(OUTLINE_SYSTEM_PROMPT).toContain("### 3. Character Arcs");
    expect(OUTLINE_SYSTEM_PROMPT).toContain("### 4. Plot Thread Management");
    expect(OUTLINE_SYSTEM_PROMPT).toContain("### 5. Word Count Planning");
  });

  it("keeps the per-chapter fields and response format", () => {
    for (const field of [
      "number: Chapter number (1-indexed)",
      "key_events",
      "characters_involved",
      "emotional_arc",
      "estimated_word_count",
      "character_summaries",
      "plot_threads",
      "total_estimated_words",
    ]) {
      expect(OUTLINE_SYSTEM_PROMPT).toContain(field);
    }
    expect(OUTLINE_SYSTEM_PROMPT).toContain("typically 3000-5000");
  });

  it("does not reference the old tool workflow", () => {
    expect(OUTLINE_SYSTEM_PROMPT).not.toContain("get_concept");
    expect(OUTLINE_SYSTEM_PROMPT).not.toContain("get_character_profiles");
    expect(OUTLINE_SYSTEM_PROMPT).not.toContain("get_world_building");
    expect(OUTLINE_SYSTEM_PROMPT).not.toContain("Tool Workflow");
  });
});

describe("buildOutlineUserPrompt", () => {
  it("includes concept, constraints, and optional context", () => {
    const prompt = buildOutlineUserPrompt({
      concept: "A heist novel set on a generation ship.",
      workingTitle: "The Long Theft",
      brief: "Space heist",
      genre: "science fiction",
      chapterCount: 24,
      chapterLengthTarget: 4000,
      characterProfiles: "Rig: the safecracker",
      worldBuilding: "The ship is 300 years into a 500-year voyage.",
    });
    expect(prompt).toContain("A heist novel set on a generation ship.");
    expect(prompt).toContain("## Working Title\n\nThe Long Theft");
    expect(prompt).toContain("Use this exact title");
    expect(prompt).toContain("## Original Author Brief\n\nSpace heist");
    expect(prompt).toContain("- Number of chapters: 24");
    expect(prompt).toContain("- Target words per chapter: 4000");
    expect(prompt).toContain("Rig: the safecracker");
    expect(prompt).toContain("300 years into a 500-year voyage");
  });

  it("omits the constraints section when no constraints given", () => {
    const prompt = buildOutlineUserPrompt({ concept: "Concept only." });
    expect(prompt).toContain("Concept only.");
    expect(prompt).not.toContain("## Constraints");
    expect(prompt).not.toContain("## Existing Character Profiles");
  });
});

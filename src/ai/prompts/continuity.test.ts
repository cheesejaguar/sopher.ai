import { describe, expect, it } from "vitest";

import {
  CONTINUITY_SEVERITIES,
  CONTINUITY_SYSTEM_PROMPT,
  buildContinuityUserPrompt,
} from "./continuity";

describe("CONTINUITY_SYSTEM_PROMPT", () => {
  it("carries the role and all five check categories", () => {
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("meticulous continuity editor");
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("### 1. Character Consistency");
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("### 2. Timeline Consistency");
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("### 3. Setting Consistency");
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("### 4. Plot Consistency");
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("### 5. Factual Consistency");
  });

  it("defines the three severity levels", () => {
    expect(CONTINUITY_SEVERITIES).toEqual(["critical", "major", "minor"]);
    expect(CONTINUITY_SYSTEM_PROMPT).toContain(
      "**Critical**: Breaks immersion or creates plot holes",
    );
    expect(CONTINUITY_SYSTEM_PROMPT).toContain(
      "**Major**: Noticeable inconsistency readers would catch",
    );
    expect(CONTINUITY_SYSTEM_PROMPT).toContain(
      "**Minor**: Small discrepancy that might slip past most readers",
    );
  });

  it("keeps the response format and fairness note", () => {
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("consistency_score: Float 0-1");
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("Be thorough but fair.");
  });

  it("does not reference the old tool workflow", () => {
    expect(CONTINUITY_SYSTEM_PROMPT).not.toContain("get_all_chapters");
    expect(CONTINUITY_SYSTEM_PROMPT).not.toContain("search_chapters");
    expect(CONTINUITY_SYSTEM_PROMPT).not.toContain("send_message");
    expect(CONTINUITY_SYSTEM_PROMPT).not.toContain("Tool Workflow");
  });
});

describe("buildContinuityUserPrompt", () => {
  it("includes manuscript, references, and focus filters", () => {
    const prompt = buildContinuityUserPrompt({
      manuscript: "## Chapter 1\n\nMara's eyes were blue.",
      characterBible: "Mara: brown eyes.",
      timeline: "Day 1: arrival.",
      focusChapters: [1, 2],
      focusCharacters: ["Mara"],
    });
    expect(prompt).toContain("Mara's eyes were blue.");
    expect(prompt).toContain("## Character Bible\n\nMara: brown eyes.");
    expect(prompt).toContain("## Timeline\n\nDay 1: arrival.");
    expect(prompt).toContain("- Focus on chapters: 1, 2");
    expect(prompt).toContain("- Focus on characters: Mara");
  });

  it("omits the focus section when no filters are given", () => {
    const prompt = buildContinuityUserPrompt({ manuscript: "Text." });
    expect(prompt).not.toContain("## Focus");
    expect(prompt).not.toContain("## Character Bible");
  });
});

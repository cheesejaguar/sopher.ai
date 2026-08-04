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
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("Rate overall consistency as a decimal from 0.0");
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("Be thorough but fair.");
  });

  /**
   * The phase call carries a structured-output schema. A second, differently
   * named result shape in the system prompt is an invitation to answer in the
   * one the schema rejects — the 2026-08-04 failure mode.
   */
  it("describes the structured result, not a rival JSON object", () => {
    expect(CONTINUITY_SYSTEM_PROMPT).not.toContain("Respond with a valid JSON object");
    expect(CONTINUITY_SYSTEM_PROMPT).not.toContain("consistency_score");
    for (const strayField of ["- type:", "- location:", "- suggestion:", "- suggestions:"]) {
      expect(CONTINUITY_SYSTEM_PROMPT).not.toContain(strayField);
    }
  });

  it("uses the same category and severity vocabulary as reviewPhaseResultSchema", () => {
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("character, timeline, setting, plot, or factual");
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("critical, major, or minor");
    expect(CONTINUITY_SYSTEM_PROMPT).toContain("suggestedFix");
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

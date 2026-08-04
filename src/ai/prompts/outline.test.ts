import { describe, expect, it } from "vitest";

import {
  NON_FICTION_OUTLINE_FRAMING,
  OUTLINE_SYSTEM_PROMPT,
  buildOutlineUserPrompt,
  outlineGenreFraming,
} from "./outline";

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

  // It is an Anthropic cache breakpoint: any per-book branch here breaks caching.
  it("carries no non-fiction or audience branch", () => {
    expect(OUTLINE_SYSTEM_PROMPT).not.toContain("Non-Fiction");
    expect(OUTLINE_SYSTEM_PROMPT).not.toContain("Audience Constraints");
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

  it("leaves an adult fiction genre exactly as it was", () => {
    const prompt = buildOutlineUserPrompt({ concept: "A heist.", genre: "thriller" });
    expect(prompt).toContain(
      "Create a detailed chapter-by-chapter outline following your response format.",
    );
    expect(prompt).not.toContain("Non-Fiction");
    expect(prompt).not.toContain("## Audience Constraints");
  });

  it("drops the plotted structure for memoir and organizes by meaning", () => {
    const prompt = buildOutlineUserPrompt({
      concept: "A year spent caring for my father.",
      genre: "memoir",
      chapterCount: 18,
    });
    expect(prompt).toContain(NON_FICTION_OUTLINE_FRAMING);
    expect(prompt).toContain("There is no climax to build toward");
    expect(prompt).toContain("driving question");
    expect(prompt).toContain("A chapter may move backward or forward in time");
    expect(prompt).toContain("never add, rename, merge, or invent people");
    // The fiction closer must be replaced, not merely supplemented.
    expect(prompt).not.toContain("Create a detailed chapter-by-chapter outline");
    expect(prompt).toContain("Each chapter is a unit of meaning, not a plot beat.");
    // Author constraints still hold for non-fiction.
    expect(prompt).toContain("- Number of chapters: 18");
  });

  it("recognizes memoir through its aliases", () => {
    for (const genre of ["Memoir", "autobiography", "personal essay"]) {
      expect(buildOutlineUserPrompt({ concept: "c", genre })).toContain(
        NON_FICTION_OUTLINE_FRAMING,
      );
    }
  });

  it("carries age-appropriate constraints for a children's book", () => {
    const prompt = buildOutlineUserPrompt({
      concept: "A badger who is afraid of the dark.",
      genre: "childrens",
      worldBuilding: "The wood at night.",
    });
    expect(prompt).toContain("## Audience Constraints: Children");
    expect(prompt).toContain("regardless of any content setting elsewhere in this prompt");
    expect(prompt).toContain("no graphic injury, and no on-page death");
    expect(prompt).toContain("short sentences and everyday words");
    // The override has to be read after the context it overrides.
    expect(prompt.indexOf("## Audience Constraints: Children")).toBeGreaterThan(
      prompt.indexOf("## World Building"),
    );
  });

  it("bands middle grade and young adult separately, and leaves adult genres alone", () => {
    expect(buildOutlineUserPrompt({ concept: "c", genre: "middle-grade" })).toContain(
      "## Audience Constraints: Middle Grade",
    );
    const ya = buildOutlineUserPrompt({ concept: "c", genre: "young_adult" });
    expect(ya).toContain("## Audience Constraints: Young Adult");
    expect(ya).toContain("intimacy happens off the page");
    expect(buildOutlineUserPrompt({ concept: "c", genre: "horror" })).not.toContain(
      "## Audience Constraints",
    );
  });
});

describe("outlineGenreFraming", () => {
  it("returns nothing for adult fiction and an unknown genre", () => {
    expect(outlineGenreFraming("mystery")).toEqual([]);
    expect(outlineGenreFraming("cyberpunk_western")).toEqual([]);
    expect(outlineGenreFraming()).toEqual([]);
  });

  it("returns the non-fiction framing first, then the age band", () => {
    expect(outlineGenreFraming("memoir")).toEqual([NON_FICTION_OUTLINE_FRAMING]);
    const middleGrade = outlineGenreFraming("middle_grade");
    expect(middleGrade).toHaveLength(1);
    expect(middleGrade[0]).toContain("## Audience Constraints: Middle Grade");
  });
});

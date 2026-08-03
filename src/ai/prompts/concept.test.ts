import { describe, expect, it } from "vitest";

import {
  CONCEPT_SYSTEM_PROMPT,
  NON_FICTION_CONCEPT_FRAMING,
  buildConceptUserPrompt,
  conceptGenreFraming,
} from "./concept";

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

  // It is an Anthropic cache breakpoint: any per-book branch here breaks caching.
  it("carries no non-fiction or audience branch", () => {
    expect(CONCEPT_SYSTEM_PROMPT).not.toContain("Non-Fiction");
    expect(CONCEPT_SYSTEM_PROMPT).not.toContain("Audience Constraints");
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

  it("leaves an adult fiction genre exactly as it was", () => {
    const prompt = buildConceptUserPrompt({ brief: "A locked-room murder.", genre: "mystery" });
    expect(prompt).toContain(
      "Expand this brief into a rich, detailed book concept following your response format.",
    );
    expect(prompt).not.toContain("Non-Fiction");
    expect(prompt).not.toContain("## Audience Constraints");
  });

  it("reframes memoir as a true account instead of an invention", () => {
    const prompt = buildConceptUserPrompt({
      brief: "The year I moved back to care for my father.",
      genre: "memoir",
    });
    expect(prompt).toContain(NON_FICTION_CONCEPT_FRAMING);
    expect(prompt).toContain("Do not invent a premise, a world, or a cast");
    expect(prompt).toContain("driving question");
    expect(prompt).toContain('never coin, complete, or "improve" a name');
    // The fiction framing — expand a brief into an invented premise and cast —
    // must be gone, not merely supplemented.
    expect(prompt).not.toContain("Expand this brief into a rich");
    expect(prompt).toContain("Develop this brief into a detailed concept for a true account");
  });

  it("recognizes memoir through its aliases", () => {
    for (const genre of ["Memoir", "autobiography", "personal essay"]) {
      expect(buildConceptUserPrompt({ brief: "b", genre })).toContain(NON_FICTION_CONCEPT_FRAMING);
    }
  });

  it("carries age-appropriate constraints for a children's book", () => {
    const prompt = buildConceptUserPrompt({
      brief: "A badger who is afraid of the dark.",
      genre: "childrens",
      // Adult settings must lose to the age band.
      contentGuidelines: "## Content Guidelines\n- **Violence:** Graphic violence allowed.",
    });
    expect(prompt).toContain("## Audience Constraints: Children");
    expect(prompt).toContain("regardless of any content setting elsewhere in this prompt");
    expect(prompt).toContain("Nothing sexual, no romance beyond friendship");
    expect(prompt).toContain("short sentences and everyday words");
    // The override has to be read after the setting it overrides.
    expect(prompt.indexOf("## Audience Constraints: Children")).toBeGreaterThan(
      prompt.indexOf("## Content Guidelines"),
    );
  });

  it("bands middle grade and young adult separately, and leaves adult genres alone", () => {
    expect(buildConceptUserPrompt({ brief: "b", genre: "middle_grade" })).toContain(
      "## Audience Constraints: Middle Grade",
    );
    const ya = buildConceptUserPrompt({ brief: "b", genre: "ya" });
    expect(ya).toContain("## Audience Constraints: Young Adult");
    expect(ya).toContain("intimacy stays off the page");
    expect(buildConceptUserPrompt({ brief: "b", genre: "historical_fiction" })).not.toContain(
      "## Audience Constraints",
    );
  });
});

describe("conceptGenreFraming", () => {
  it("returns nothing for adult fiction and an unknown genre", () => {
    expect(conceptGenreFraming("thriller")).toEqual([]);
    expect(conceptGenreFraming("cyberpunk_western")).toEqual([]);
    expect(conceptGenreFraming()).toEqual([]);
  });

  it("returns the non-fiction framing first, then the age band", () => {
    expect(conceptGenreFraming("memoir")).toEqual([NON_FICTION_CONCEPT_FRAMING]);
    const childrens = conceptGenreFraming("childrens");
    expect(childrens).toHaveLength(1);
    expect(childrens[0]).toContain("## Audience Constraints: Children");
  });
});

import { describe, expect, it } from "vitest";

import { buildCreativeQuestionPrompt, CREATIVE_DIRECTOR_SYSTEM_PROMPT } from "./creative-director";

describe("creative director prompt", () => {
  it("requires one bounded question with exactly three choices and one recommendation", () => {
    expect(CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("Ask one plain-language question");
    expect(CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("exactly three distinct");
    expect(CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("Recommend exactly one");

    const prompt = buildCreativeQuestionPrompt({
      brief: "A lighthouse keeper finds a door in the tide.",
      genre: "Fantasy",
      concept: {
        title: "The Tide Door",
        logline: "A keeper follows a door that appears only at low tide.",
        synopsis: "Mara enters a drowned country to save her home.",
        themes: ["belonging"],
        setting: "A storm coast",
        centralConflict: "The door demands a memory for every crossing.",
        uniqueElements: ["memory tolls"],
        characters: [],
        moderation: { flagged: false },
      },
    });
    expect(prompt).toContain("## Author brief");
    expect(prompt).toContain("## Developed concept");
    expect(prompt).toContain("single most useful unresolved story-direction question");
  });
});

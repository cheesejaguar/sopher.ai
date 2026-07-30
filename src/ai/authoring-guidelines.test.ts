import { describe, expect, it } from "vitest";

import { buildAuthoringGuidelines, buildFrozenAuthoringContract } from "./authoring-guidelines";

describe("buildAuthoringGuidelines", () => {
  it("carries POV, tense, tone, and every content boundary into agent guidance", () => {
    const result = buildAuthoringGuidelines({
      brief: "A cartographer follows a disappearing road.",
      genre: "Fantasy",
      styleGuide: null,
      voiceProfile: "immersive",
      pov: "first",
      tense: "present",
      tone: "hopeful but tense",
      styleProfile: "cinematic",
      heatLevel: "mild",
      violenceLevel: "moderate",
      profanity: "none",
      avoidTopics: ["animal harm", "graphic illness"],
    });

    expect(result).toContain("first person");
    expect(result).toContain("Narrative tense: present");
    expect(result).toContain("Tone: hopeful but tense");
    expect(result).toContain('must not exceed the "mild" level');
    expect(result).toContain('must not exceed the "moderate" level');
    expect(result).toContain('must not exceed the "none" level');
    expect(result).toContain("animal harm, graphic illness");
    expect(result).toContain("ceiling, not a request");
  });

  it("combines style, voice, and boundaries into one frozen agent contract", () => {
    const result = buildFrozenAuthoringContract({
      brief: "A cartographer follows a disappearing road.",
      genre: "Fantasy",
      styleGuide: "Use tactile concrete detail.",
      voiceProfile: "immersive",
      pov: "third_limited",
      tense: "past",
      tone: "wondrous",
      styleProfile: null,
      heatLevel: "none",
      violenceLevel: "mild",
      profanity: "none",
      avoidTopics: [],
    });
    expect(result).toContain("Style guide: Use tactile concrete detail.");
    expect(result).toContain("Voice profile: immersive.");
    expect(result).toContain("third-person limited");
    expect(result).toContain("Narrative tense: past");
  });
});

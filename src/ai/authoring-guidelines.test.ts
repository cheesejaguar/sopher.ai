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

describe("audience and non-fiction guardrails", () => {
  const base = {
    brief: "A beagle gets superpowers on trash day.",
    styleGuide: null,
    voiceProfile: null,
    pov: null,
    tense: null,
    tone: null,
    styleProfile: null,
    avoidTopics: [] as string[],
  };

  it("clamps an adult content ceiling down to what a children's book allows", () => {
    // The shape step offers these selects for every genre, so this combination
    // is reachable — and this contract is the only one the chapter writer sees.
    const result = buildAuthoringGuidelines({
      ...base,
      genre: "childrens",
      heatLevel: "explicit",
      violenceLevel: "graphic",
      profanity: "strong",
    });

    expect(result).toContain('Romantic/sexual content must not exceed the "none" level');
    expect(result).toContain('Violence must not exceed the "none" level');
    expect(result).toContain('Profanity must not exceed the "none" level');
    expect(result).not.toContain("explicit");
    expect(result).not.toContain("graphic");
    expect(result).toContain("read aloud at bedtime");
  });

  it("gives middle grade and young adult their own ceilings", () => {
    const mg = buildAuthoringGuidelines({
      ...base,
      genre: "middle_grade",
      heatLevel: "explicit",
      violenceLevel: "graphic",
      profanity: "strong",
    });
    expect(mg).toContain('Violence must not exceed the "mild" level');
    expect(mg).toContain('Romantic/sexual content must not exceed the "none" level');

    const ya = buildAuthoringGuidelines({
      ...base,
      genre: "young_adult",
      heatLevel: "explicit",
      violenceLevel: "graphic",
      profanity: "strong",
    });
    expect(ya).toContain('Violence must not exceed the "moderate" level');
    expect(ya).toContain('Profanity must not exceed the "moderate" level');
  });

  it("leaves adult genres exactly as the author set them", () => {
    const result = buildAuthoringGuidelines({
      ...base,
      genre: "horror",
      heatLevel: "explicit",
      violenceLevel: "graphic",
      profanity: "strong",
    });
    expect(result).toContain('Violence must not exceed the "graphic" level');
    expect(result).toContain('Romantic/sexual content must not exceed the "explicit" level');
    expect(result).not.toContain("outrank every other instruction");
  });

  it("tells every agent a memoir is true, including the one that writes prose", () => {
    const contract = buildFrozenAuthoringContract({
      ...base,
      genre: "memoir",
      heatLevel: null,
      violenceLevel: null,
      profanity: null,
    });
    expect(contract).toContain("This is a true account, not fiction");
    expect(contract).toContain("never invent events");

    const fiction = buildFrozenAuthoringContract({
      ...base,
      genre: "fantasy",
      heatLevel: null,
      violenceLevel: null,
      profanity: null,
    });
    expect(fiction ?? "").not.toContain("true account");
  });

  it("treats an unknown free-text genre as adult fiction", () => {
    const result = buildAuthoringGuidelines({
      ...base,
      genre: "a cozy western",
      heatLevel: "moderate",
      violenceLevel: "moderate",
      profanity: "mild",
    });
    expect(result).toContain('Violence must not exceed the "moderate" level');
    expect(result ?? "").not.toContain("true account");
  });
});

import { describe, expect, it } from "vitest";

import {
  STYLE_PROFILE_IDS,
  STYLE_PROFILES,
  getStyleForGenre,
  getStyleProfile,
  renderStylePrompt,
  stylePrompt,
  type StyleProfileId,
} from "./style-profiles";

describe("STYLE_PROFILES data completeness", () => {
  it("contains all 10 genre style profiles", () => {
    expect(STYLE_PROFILE_IDS).toHaveLength(10);
    expect(Object.keys(STYLE_PROFILES).sort()).toEqual([...STYLE_PROFILE_IDS].sort());
    const expected: StyleProfileId[] = [
      "hemingway",
      "literary_fiction",
      "commercial_fiction",
      "romance",
      "thriller",
      "fantasy",
      "mystery",
      "horror",
      "young_adult",
      "science_fiction",
    ];
    for (const id of expected) {
      expect(STYLE_PROFILES[id]).toBeDefined();
    }
  });

  it("every profile has a name and description", () => {
    for (const profile of Object.values(STYLE_PROFILES)) {
      expect(profile.name.length).toBeGreaterThan(0);
      expect(profile.description.length).toBeGreaterThan(0);
    }
  });

  it("keeps actionToReflectionRatio within 0..1", () => {
    for (const profile of Object.values(STYLE_PROFILES)) {
      expect(profile.actionToReflectionRatio).toBeGreaterThanOrEqual(0);
      expect(profile.actionToReflectionRatio).toBeLessThanOrEqual(1);
    }
  });

  it("preserves exact source parameter values (spot checks)", () => {
    expect(STYLE_PROFILES.hemingway.proseStyle).toBe("sparse");
    expect(STYLE_PROFILES.hemingway.sensoryDetails).toBe(false);
    expect(STYLE_PROFILES.hemingway.internalMonologue).toBe(false);
    expect(STYLE_PROFILES.hemingway.showDontTell).toBe(true);
    expect(STYLE_PROFILES.literary_fiction.vocabularyLevel).toBe("advanced");
    expect(STYLE_PROFILES.literary_fiction.sentenceVariety).toBe("complex");
    expect(STYLE_PROFILES.romance.actionToReflectionRatio).toBe(0.3);
    expect(STYLE_PROFILES.romance.humorLevel).toBe("moderate");
    expect(STYLE_PROFILES.thriller.actionToReflectionRatio).toBe(0.7);
    expect(STYLE_PROFILES.thriller.descriptionDensity).toBe("minimal");
    expect(STYLE_PROFILES.fantasy.proseStyle).toBe("lyrical");
    expect(STYLE_PROFILES.fantasy.dialogueStyle).toBe("stylized");
    expect(STYLE_PROFILES.mystery.pov).toBe("first_person");
    expect(STYLE_PROFILES.horror.dialogueStyle).toBe("minimal");
    expect(STYLE_PROFILES.horror.proseStyle).toBe("literary");
    expect(STYLE_PROFILES.young_adult.pov).toBe("first_person");
    expect(STYLE_PROFILES.young_adult.tense).toBe("present");
    expect(STYLE_PROFILES.science_fiction.description).toBe(
      "Clear, idea-driven prose with technical clarity",
    );
  });

  it("uses the Python dataclass defaults where the source did not override", () => {
    for (const profile of Object.values(STYLE_PROFILES)) {
      expect(profile.sceneTransitionStyle).toBe("smooth");
    }
    expect(STYLE_PROFILES.commercial_fiction.actionToReflectionRatio).toBe(0.5);
    expect(STYLE_PROFILES.hemingway.actionToReflectionRatio).toBe(0.5);
  });

  it("only Hemingway and Thriller use past-tense sparse prose; only YA uses present tense", () => {
    const sparse = Object.entries(STYLE_PROFILES)
      .filter(([, p]) => p.proseStyle === "sparse")
      .map(([id]) => id);
    expect(sparse.sort()).toEqual(["hemingway", "thriller"]);
    const present = Object.entries(STYLE_PROFILES)
      .filter(([, p]) => p.tense === "present")
      .map(([id]) => id);
    expect(present).toEqual(["young_adult"]);
  });
});

describe("stylePrompt", () => {
  it("renders the exact Hemingway prompt (including double period from sparse prose)", () => {
    expect(stylePrompt("hemingway")).toBe(
      "Write in third person limited, staying close to the POV character's thoughts and perceptions. " +
        "Use past tense throughout. " +
        "Use sparse, minimalist prose - every word must earn its place. Short sentences. No purple prose.. " +
        "Write natural, realistic dialogue that sounds like real speech. " +
        "Keep descriptions brief and functional. " +
        "Use mostly simple, clear sentences. " +
        "Use accessible vocabulary for broad readability. " +
        "Show emotions and states through action and dialogue rather than telling.",
    );
  });

  it("includes first person, present tense, and humor for young adult", () => {
    const prompt = stylePrompt("young_adult");
    expect(prompt).toContain("Write in first person perspective");
    expect(prompt).toContain("Use present tense for immediacy");
    expect(prompt).toContain("Include moderate humor to lighten the narrative");
    expect(prompt).toContain("Include vivid sensory details (sight, sound, smell, touch, taste)");
    expect(prompt).toContain("Include character's internal thoughts and reflections");
  });

  it("omits humor when the humor level is none", () => {
    const prompt = stylePrompt("horror");
    expect(prompt).not.toContain("humor");
    expect(prompt).toContain("Include rich, detailed descriptions of settings and characters");
    expect(prompt).toContain("Keep dialogue minimal and impactful");
  });

  it("omits sensory details and internal monologue when disabled", () => {
    const prompt = stylePrompt("hemingway");
    expect(prompt).not.toContain("Include vivid sensory details");
    expect(prompt).not.toContain("Include character's internal thoughts");
  });

  it("always ends with a period", () => {
    for (const id of STYLE_PROFILE_IDS) {
      expect(stylePrompt(id).endsWith(".")).toBe(true);
    }
  });

  it("renders custom profiles through renderStylePrompt", () => {
    const prompt = renderStylePrompt({
      ...STYLE_PROFILES.commercial_fiction,
      pov: "second_person",
      tense: "present",
    });
    expect(prompt).toContain("Write in second person, addressing the reader as 'you'");
    expect(prompt).toContain("Use present tense for immediacy");
  });
});

describe("getStyleProfile", () => {
  it("looks up by id and by display name", () => {
    expect(getStyleProfile("hemingway")).toBe(STYLE_PROFILES.hemingway);
    expect(getStyleProfile("Literary Fiction")).toBe(STYLE_PROFILES.literary_fiction);
    expect(getStyleProfile("young-adult")).toBe(STYLE_PROFILES.young_adult);
    expect(getStyleProfile("SCIENCE FICTION")).toBe(STYLE_PROFILES.science_fiction);
  });

  it("returns undefined for unknown names", () => {
    expect(getStyleProfile("nonfiction")).toBeUndefined();
  });
});

describe("getStyleForGenre", () => {
  it("maps genres and aliases to the recommended profile", () => {
    expect(getStyleForGenre("romance")).toBe(STYLE_PROFILES.romance);
    expect(getStyleForGenre("sci-fi")).toBe(STYLE_PROFILES.science_fiction);
    expect(getStyleForGenre("scifi")).toBe(STYLE_PROFILES.science_fiction);
    expect(getStyleForGenre("Science Fiction")).toBe(STYLE_PROFILES.science_fiction);
    expect(getStyleForGenre("YA")).toBe(STYLE_PROFILES.young_adult);
    expect(getStyleForGenre("literary")).toBe(STYLE_PROFILES.literary_fiction);
  });

  it("falls back to commercial fiction for unknown genres", () => {
    expect(getStyleForGenre("western")).toBe(STYLE_PROFILES.commercial_fiction);
    expect(getStyleForGenre("")).toBe(STYLE_PROFILES.commercial_fiction);
  });
});

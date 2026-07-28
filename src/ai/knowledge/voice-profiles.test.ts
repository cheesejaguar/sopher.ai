import { describe, expect, it } from "vitest";

import {
  DEFAULT_VOICE_PARAMETERS,
  VOICE_CHARACTERISTICS,
  VOICE_PROFILE_IDS,
  VOICE_PROFILES,
  blendVoices,
  blendedVoicePrompt,
  getVoiceProfilesForGenre,
  renderVoiceBriefPrompt,
  renderVoicePrompt,
  voiceBriefPrompt,
  voicePrompt,
  type VoiceProfileId,
} from "./voice-profiles";

const NUMERIC_PARAMS = [
  "dialogueNaturalness",
  "philosophicalDepth",
  "detailOrientation",
  "sensoryFocus",
  "introspectionLevel",
  "actionFocus",
] as const;

describe("VOICE_PROFILES data completeness", () => {
  it("contains all 10 author-inspired profiles", () => {
    expect(VOICE_PROFILE_IDS).toHaveLength(10);
    expect(Object.keys(VOICE_PROFILES).sort()).toEqual([...VOICE_PROFILE_IDS].sort());
    const expected: VoiceProfileId[] = [
      "hemingway",
      "austen",
      "king",
      "pratchett",
      "mccarthy",
      "rowling",
      "atwood",
      "gaiman",
      "christie",
      "sanderson",
    ];
    for (const id of expected) {
      expect(VOICE_PROFILES[id]).toBeDefined();
      expect(VOICE_PROFILES[id].id).toBe(id);
    }
  });

  it("defines all 10 voice characteristic axes", () => {
    expect(VOICE_CHARACTERISTICS).toHaveLength(10);
    expect(new Set(VOICE_CHARACTERISTICS).size).toBe(10);
  });

  it("every profile has a description, inspiration, techniques, avoids, and genres", () => {
    for (const profile of Object.values(VOICE_PROFILES)) {
      expect(profile.name.length).toBeGreaterThan(0);
      expect(profile.description.length).toBeGreaterThan(0);
      expect(profile.inspiredBy.length).toBeGreaterThan(0);
      expect(profile.signatureTechniques.length).toBeGreaterThanOrEqual(3);
      expect(profile.avoids.length).toBeGreaterThanOrEqual(3);
      expect(profile.bestForGenres.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps all numeric parameters within 0..1", () => {
    for (const profile of Object.values(VOICE_PROFILES)) {
      for (const key of NUMERIC_PARAMS) {
        const value = profile.parameters[key];
        expect(value, `${profile.id}.${key}`).toBeGreaterThanOrEqual(0);
        expect(value, `${profile.id}.${key}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("preserves exact source parameter values (spot checks)", () => {
    expect(VOICE_PROFILES.hemingway.parameters.dialogueNaturalness).toBe(0.9);
    expect(VOICE_PROFILES.hemingway.parameters.introspectionLevel).toBe(0.2);
    expect(VOICE_PROFILES.hemingway.parameters.sentenceRhythm).toBe("staccato");
    expect(VOICE_PROFILES.king.parameters.dialogueNaturalness).toBe(0.95);
    expect(VOICE_PROFILES.king.parameters.humorStyle).toBe("sardonic");
    expect(VOICE_PROFILES.mccarthy.parameters.philosophicalDepth).toBe(0.9);
    expect(VOICE_PROFILES.mccarthy.parameters.sensoryFocus).toBe(0.9);
    expect(VOICE_PROFILES.mccarthy.parameters.pacingTendency).toBe("slow_burn");
    expect(VOICE_PROFILES.austen.parameters.narrativeDistance).toBe("omniscient");
    expect(VOICE_PROFILES.gaiman.parameters.sentenceRhythm).toBe("hypnotic");
    expect(VOICE_PROFILES.christie.parameters.detailOrientation).toBe(0.9);
    expect(VOICE_PROFILES.rowling.parameters.detailOrientation).toBe(0.75);
    expect(VOICE_PROFILES.sanderson.parameters.actionFocus).toBe(0.7);
    expect(VOICE_PROFILES.atwood.parameters.actionFocus).toBe(0.2);
  });

  it("preserves signature technique and avoid lists (spot checks)", () => {
    expect(VOICE_PROFILES.hemingway.signatureTechniques).toContain(
      "iceberg theory (leave meaning implicit)",
    );
    expect(VOICE_PROFILES.hemingway.avoids).toContain("adverbs");
    expect(VOICE_PROFILES.mccarthy.avoids).toContain("quotation marks");
    expect(VOICE_PROFILES.pratchett.signatureTechniques).toContain(
      "philosophical musings disguised as humor",
    );
    expect(VOICE_PROFILES.christie.signatureTechniques).toContain("fair-play clue placement");
    expect(VOICE_PROFILES.sanderson.avoids).toContain("deus ex machina");
    expect(VOICE_PROFILES.gaiman.bestForGenres).toEqual([
      "fantasy",
      "horror",
      "urban fantasy",
      "fairy tales",
    ]);
  });

  it("exposes the Python default voice parameters", () => {
    expect(DEFAULT_VOICE_PARAMETERS).toEqual({
      sentenceRhythm: "varied",
      vocabularyLevel: "moderate",
      emotionalIntensity: "moderate",
      imageryDensity: "moderate",
      narrativeDistance: "moderate",
      humorStyle: "none",
      pacingTendency: "measured",
      dialogueNaturalness: 0.5,
      philosophicalDepth: 0.3,
      detailOrientation: 0.5,
      sensoryFocus: 0.5,
      introspectionLevel: 0.5,
      actionFocus: 0.5,
    });
  });
});

describe("voicePrompt", () => {
  it("renders the Hemingway prompt with the exact source strings", () => {
    const prompt = voicePrompt("hemingway");
    expect(prompt).toContain(
      "Write in a voice that is sparse, direct, and emotionally understated",
    );
    expect(prompt).toContain("Take inspiration from the style of Ernest Hemingway.");
    expect(prompt).toContain("Use short, punchy sentences. Cut the fat. Get to the point.");
    expect(prompt).toContain("Use simple, everyday words. Avoid jargon and pretension.");
    expect(prompt).toContain("Keep emotions understated. Show restraint. Let readers infer.");
    expect(prompt).toContain("Use minimal description. Let readers fill in the gaps.");
    expect(prompt).toContain("Stay close to the viewpoint character's experience.");
    expect(prompt).toContain("Use dry, understated humor. Deadpan delivery.");
    expect(prompt).toContain("Maintain a steady, measured pace.");
    // dialogueNaturalness 0.9 > 0.7
    expect(prompt).toContain("Make dialogue sound natural and authentic to each character.");
    // introspectionLevel 0.2 < 0.3
    expect(prompt).toContain("Focus on external action rather than internal thoughts.");
    // philosophicalDepth 0.3 triggers neither branch
    expect(prompt).not.toContain("Explore philosophical themes");
    expect(prompt).not.toContain("Touch on deeper meanings");
    expect(prompt).toContain(
      "Employ these techniques: iceberg theory (leave meaning implicit), repetition for emphasis, " +
        "simple declarative sentences, dialogue-heavy scenes, understated emotion",
    );
    expect(prompt).toContain(
      "Avoid: adverbs, flowery language, excessive description, explaining emotions, complex vocabulary",
    );
  });

  it("applies the numeric thresholds for McCarthy", () => {
    const prompt = voicePrompt("mccarthy");
    // philosophicalDepth 0.9 > 0.7
    expect(prompt).toContain("Explore philosophical themes and existential questions.");
    // sensoryFocus 0.9 > 0.7
    expect(prompt).toContain("Engage all five senses in descriptions.");
    // detailOrientation 0.8 > 0.7
    expect(prompt).toContain("Include specific, concrete details.");
    // introspectionLevel 0.3 is not < 0.3
    expect(prompt).not.toContain("Focus on external action rather than internal thoughts.");
    // dialogueNaturalness 0.7 is not > 0.7
    expect(prompt).not.toContain("Make dialogue sound natural and authentic to each character.");
    expect(prompt).toContain("Take your time. Build slowly. Let tension accumulate.");
  });

  it("skips the humor section when humorStyle is none", () => {
    const prompt = renderVoicePrompt({
      name: "Neutral",
      parameters: { ...DEFAULT_VOICE_PARAMETERS },
    });
    expect(prompt).not.toContain("humor");
    // Mid-range parameters emit no numeric-threshold sections
    expect(prompt).not.toContain("Dialogue can be stylized or formal.");
    expect(prompt).not.toContain("Touch on deeper meanings and themes where appropriate.");
  });

  it("caps techniques and avoids at five entries", () => {
    const prompt = renderVoicePrompt({
      name: "Crowded",
      parameters: { ...DEFAULT_VOICE_PARAMETERS },
      signatureTechniques: ["t1", "t2", "t3", "t4", "t5", "t6"],
      avoids: ["a1", "a2", "a3", "a4", "a5", "a6"],
    });
    expect(prompt).toContain("Employ these techniques: t1, t2, t3, t4, t5");
    expect(prompt).not.toContain("t6");
    expect(prompt).toContain("Avoid: a1, a2, a3, a4, a5");
    expect(prompt).not.toContain("a6");
  });

  it("joins sections with blank lines", () => {
    expect(voicePrompt("austen")).toContain("\n\n");
  });
});

describe("voiceBriefPrompt", () => {
  it("renders the exact Hemingway brief prompt", () => {
    expect(voiceBriefPrompt("hemingway")).toBe(
      "Write with in the style of Ernest Hemingway, short punchy sentences, " +
        "simple direct language, emotional restraint, spare description, dry humor.",
    );
  });

  it("includes flowing prose and witty humor for Austen", () => {
    const brief = voiceBriefPrompt("austen");
    expect(brief).toContain("in the style of Jane Austen");
    expect(brief).toContain("flowing prose");
    expect(brief).toContain("witty humor");
  });

  it("falls back to the profile name when no distinctive traits apply", () => {
    const brief = renderVoiceBriefPrompt({
      name: "Plain",
      parameters: { ...DEFAULT_VOICE_PARAMETERS },
    });
    expect(brief).toBe("Write in a Plain voice.");
  });
});

describe("blendVoices", () => {
  it("averages numeric parameters with equal weights", () => {
    const blended = blendVoices("hemingway", "mccarthy");
    expect(blended.weights[0]).toBeCloseTo(0.5, 10);
    expect(blended.weights[1]).toBeCloseTo(0.5, 10);
    expect(blended.parameters.dialogueNaturalness).toBeCloseTo(0.8, 10); // (0.9 + 0.7) / 2
    expect(blended.parameters.philosophicalDepth).toBeCloseTo(0.6, 10); // (0.3 + 0.9) / 2
    expect(blended.parameters.sensoryFocus).toBeCloseTo(0.75, 10); // (0.6 + 0.9) / 2
    expect(blended.parameters.introspectionLevel).toBeCloseTo(0.25, 10); // (0.2 + 0.3) / 2
    expect(blended.sourceProfiles).toEqual(["hemingway", "mccarthy"]);
  });

  it("takes enum parameters from the first profile on a tie", () => {
    const blended = blendVoices("hemingway", "mccarthy");
    expect(blended.parameters.sentenceRhythm).toBe("staccato");
    expect(blended.parameters.vocabularyLevel).toBe("simple");
    expect(blended.parameters.imageryDensity).toBe("sparse");
    expect(blended.parameters.pacingTendency).toBe("measured");
  });

  it("normalizes weights and takes enums from the dominant profile", () => {
    const blended = blendVoices("hemingway", "mccarthy", [1, 3]);
    expect(blended.weights[0]).toBeCloseTo(0.25, 10);
    expect(blended.weights[1]).toBeCloseTo(0.75, 10);
    // McCarthy dominates
    expect(blended.parameters.sentenceRhythm).toBe("varied");
    expect(blended.parameters.vocabularyLevel).toBe("literary");
    expect(blended.parameters.pacingTendency).toBe("slow_burn");
    // Weighted average: 0.9 * 0.25 + 0.7 * 0.75 = 0.75
    expect(blended.parameters.dialogueNaturalness).toBeCloseTo(0.75, 10);
  });

  it("uses the provided name and defaults to Blended Voice", () => {
    expect(blendVoices("king", "gaiman").name).toBe("Blended Voice");
    expect(blendVoices("king", "gaiman", [0.5, 0.5], "Dark Whimsy").name).toBe("Dark Whimsy");
  });

  it("renders a prompt from a blended voice", () => {
    const blended = blendVoices("hemingway", "mccarthy");
    const prompt = blendedVoicePrompt(blended);
    // Enum sections come from the dominant (first) profile
    expect(prompt).toContain("Use short, punchy sentences. Cut the fat. Get to the point.");
    // dialogueNaturalness 0.8 > 0.7
    expect(prompt).toContain("Make dialogue sound natural and authentic to each character.");
    // No description or inspiration on a blended voice
    expect(prompt).not.toContain("Write in a voice that is");
    expect(prompt).not.toContain("Take inspiration from the style of");
  });
});

describe("getVoiceProfilesForGenre", () => {
  it("finds all fantasy-friendly voices, including partial genre matches", () => {
    const names = getVoiceProfilesForGenre("fantasy").map((p) => p.id);
    expect(names).toEqual(["pratchett", "rowling", "gaiman", "sanderson"]);
  });

  it("matches literary fiction voices", () => {
    const names = getVoiceProfilesForGenre("literary fiction").map((p) => p.id);
    expect(names).toEqual(["hemingway", "mccarthy", "atwood"]);
  });

  it("is case-insensitive", () => {
    const names = getVoiceProfilesForGenre("Mystery").map((p) => p.id);
    expect(names).toEqual(["christie"]);
  });

  it("returns an empty list for unknown genres", () => {
    expect(getVoiceProfilesForGenre("cookbook")).toEqual([]);
  });
});

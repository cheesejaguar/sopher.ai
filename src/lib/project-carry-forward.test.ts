import { describe, expect, it } from "vitest";

import { CUSTOM_GENRE, MAX_CUSTOM_GENRE_LENGTH } from "@/components/wizard/wizard-state";
import { projectCarryForwardSetup, type CarryForwardSource } from "@/lib/project-carry-forward";

function source(overrides: Partial<CarryForwardSource> = {}): CarryForwardSource {
  return {
    title: "The Salt Road",
    brief: "A cartographer walks the last trade route out of a drowning city.",
    genre: "fantasy",
    subgenre: null,
    protagonist: null,
    setting: null,
    experience: "full_book",
    targetChapters: 18,
    targetWordsPerChapter: 3_400,
    settings: {},
    ...overrides,
  };
}

describe("projectCarryForwardSetup", () => {
  it("carries the setup the author typed, without the lines composeBrief appended", () => {
    const setup = projectCarryForwardSetup(
      source({
        brief:
          "A cartographer walks the last trade route out of a drowning city.\n\nSubgenre: epic.\nProtagonist: Mira.\nSetting: Vell.",
        subgenre: "epic",
        protagonist: "Mira",
        setting: "Vell",
      }),
    );

    expect(setup.title).toBe("The Salt Road");
    expect(setup.brief).toBe("A cartographer walks the last trade route out of a drowning city.");
    expect(setup.subgenre).toBe("epic");
    expect(setup.protagonist).toBe("Mira");
    expect(setup.setting).toBe("Vell");
  });

  it("leaves a brief that was never composed exactly as written", () => {
    const setup = projectCarryForwardSetup(
      source({ brief: "Just the brief.", subgenre: "epic", protagonist: null, setting: null }),
    );

    expect(setup.brief).toBe("Just the brief.");
  });

  it("returns a catalog genre as its canonical id", () => {
    const setup = projectCarryForwardSetup(source({ genre: "fantasy" }));

    expect(setup.genre).toBe("fantasy");
    expect(setup.customGenre).toBe("");
  });

  it("returns a genre outside the catalog through the CUSTOM_GENRE sentinel", () => {
    const setup = projectCarryForwardSetup(source({ genre: "  weird western  " }));

    expect(setup.genre).toBe(CUSTOM_GENRE);
    expect(setup.customGenre).toBe("weird western");
  });

  it("truncates a custom genre to what the wizard's own field accepts", () => {
    const setup = projectCarryForwardSetup(source({ genre: "x".repeat(120) }));

    expect(setup.customGenre).toHaveLength(MAX_CUSTOM_GENRE_LENGTH);
  });

  it("carries no genre at all when the project never had one", () => {
    expect(projectCarryForwardSetup(source({ genre: null })).genre).toBeNull();
    expect(projectCarryForwardSetup(source({ genre: "   " })).genre).toBeNull();
  });

  it("carries the safe subset of settings", () => {
    const setup = projectCarryForwardSetup(
      source({
        settings: {
          pov: "first",
          tense: "present",
          heatLevel: "moderate",
          violenceLevel: "graphic",
          profanity: "strong",
          authoringMode: "autopilot",
          voiceProfile: "atwood",
          qualityTier: "premium",
          requireOutlineApproval: false,
        },
      }),
    );

    expect(setup).toMatchObject({
      pov: "first",
      tense: "present",
      heatLevel: "moderate",
      violenceLevel: "graphic",
      profanity: "strong",
      authoringMode: "autopilot",
      voiceProfile: "atwood",
      tier: "premium",
      requireOutlineApproval: false,
    });
  });

  it("omits unreadable settings rather than blanking the wizard's defaults", () => {
    // A key present as `undefined` would win over `initialWizardState` when the
    // wizard spreads this object, so absence is the only safe representation.
    const setup = projectCarryForwardSetup(
      source({
        settings: {
          pov: "sideways",
          voiceProfile: "shakespeare",
          qualityTier: "luxury",
          requireOutlineApproval: "yes",
        } as never,
      }),
    );

    expect("pov" in setup).toBe(false);
    expect("voiceProfile" in setup).toBe(false);
    expect("tier" in setup).toBe(false);
    expect("requireOutlineApproval" in setup).toBe(false);
  });

  it("carries a full book's shape, clamped to what the shape step can show", () => {
    const setup = projectCarryForwardSetup(
      source({ targetChapters: 60, targetWordsPerChapter: 12_000 }),
    );

    expect(setup.chapters).toBe(40);
    expect(setup.wordsPerChapter).toBe(6_000);
  });

  it("clamps words per chapter against the carried genre's own floor", () => {
    const setup = projectCarryForwardSetup(
      source({ genre: "childrens", targetWordsPerChapter: 100 }),
    );

    expect(setup.wordsPerChapter).toBe(500);
  });

  it("never carries the included story's server-owned production shape", () => {
    const setup = projectCarryForwardSetup(
      source({ experience: "trial_short_story", targetChapters: 3, targetWordsPerChapter: 1_000 }),
    );

    expect("chapters" in setup).toBe(false);
    expect("wordsPerChapter" in setup).toBe(false);
    expect(setup.title).toBe("The Salt Road");
  });

  it("carries nothing beyond the wizard answers a new book needs", () => {
    const setup = projectCarryForwardSetup(
      source({
        settings: {
          pov: "first",
          tense: "present",
          heatLevel: "mild",
          violenceLevel: "mild",
          profanity: "none",
          authoringMode: "guided",
          voiceProfile: "king",
          qualityTier: "standard",
          requireOutlineApproval: true,
        },
      }),
    );

    expect(Object.keys(setup).sort()).toEqual(
      [
        "authoringMode",
        "brief",
        "chapters",
        "customGenre",
        "genre",
        "heatLevel",
        "pov",
        "profanity",
        "protagonist",
        "requireOutlineApproval",
        "setting",
        "subgenre",
        "tense",
        "tier",
        "title",
        "violenceLevel",
        "voiceProfile",
        "wordsPerChapter",
      ].sort(),
    );
  });
});

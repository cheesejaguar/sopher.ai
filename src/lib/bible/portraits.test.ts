import { describe, expect, it } from "vitest";

import { portraitPrompt } from "./portraits";

describe("portraitPrompt", () => {
  it("uses the character's structured visual canon", () => {
    const prompt = portraitPrompt({
      kind: "character",
      name: "Mara Venn",
      genre: "literary adventure",
      attrs: {
        appearance: "Weathered and compact",
        age: "31",
        build: "Short, wiry, and sure-footed",
        face: "Angular face with a cleft chin",
        hair: "Black curls cut at the jaw",
        eyes: "Grey-green, narrow-set",
        complexion: "Warm brown with wind-reddened cheeks",
        distinguishingFeatures: ["rope scar across her right palm"],
        wardrobe: "Waxed indigo coat and salt-stained boots",
        posture: "Weight pitched forward as if walking into wind",
        heritage: "Coastal Averrin",
        occupation: "harbor cartographer",
      },
    });

    expect(prompt).toContain("Short, wiry, and sure-footed");
    expect(prompt).toContain("Angular face with a cleft chin");
    expect(prompt).toContain("Black curls cut at the jaw");
    expect(prompt).toContain("Grey-green, narrow-set");
    expect(prompt).toContain("rope scar across her right palm");
    expect(prompt).toContain("Waxed indigo coat and salt-stained boots");
    expect(prompt).toContain("Weight pitched forward as if walking into wind");
  });

  it("never leaks nonvisual secrets or inner-life notes into image generation", () => {
    const prompt = portraitPrompt({
      kind: "character",
      name: "Mara Venn",
      attrs: {
        appearance: "Weathered and compact",
        secrets: ["THE HIDDEN MUTINY"],
        fears: ["THE DROWNING MEMORY"],
        background: "THE SEALED TESTIMONY",
        personality: ["THE PRIVATE RAGE"],
      },
    });

    expect(prompt).not.toContain("THE HIDDEN MUTINY");
    expect(prompt).not.toContain("THE DROWNING MEMORY");
    expect(prompt).not.toContain("THE SEALED TESTIMONY");
    expect(prompt).not.toContain("THE PRIVATE RAGE");
  });
});

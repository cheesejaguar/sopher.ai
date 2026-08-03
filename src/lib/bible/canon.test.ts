import { describe, expect, it } from "vitest";

import { editableCanonFromAttrs, mergeEditableCanonAttrs } from "./canon";

const sharedInput = {
  appearance: "Copper skin and a weathered coat",
  background: "Raised beside the old locks",
  goals: ["Restore the river quarter"],
  personality: ["Observant", "Stubborn"],
  voice: "Spare, exact sentences",
  arc: "Learns to share authorship",
  facts: ["The compass responds to her touch"],
};

describe("editable Story Bible canon", () => {
  it("maps generated character fields onto the author-facing profile", () => {
    expect(
      editableCanonFromAttrs({
        kind: "character",
        name: "Mara Vale",
        aliases: ["Mara"],
        attrs: { appearance: "Wiry", background: "A mapmaker", speech: "Brief", facts: ["A"] },
      }),
    ).toMatchObject({
      name: "Mara Vale",
      aliases: ["Mara"],
      appearance: "Wiry",
      background: "A mapmaker",
      voice: "Brief",
      facts: ["A"],
    });
  });

  it("uses image-prompt-compatible fields for places and objects", () => {
    expect(
      editableCanonFromAttrs({
        kind: "location",
        name: "The Observatory",
        aliases: [],
        attrs: { description: "A sealed copper dome", background: "Built before the flood" },
      }).appearance,
    ).toBe("A sealed copper dome");
    expect(
      editableCanonFromAttrs({
        kind: "object",
        name: "The Compass",
        aliases: [],
        attrs: { description: "Tarnished brass", provenance: "Made by Mara's grandfather" },
      }).background,
    ).toBe("Made by Mara's grandfather");
  });

  it("replaces only author-controlled fields and preserves unknown rich attributes", () => {
    const result = mergeEditableCanonAttrs(
      {
        appearance: "Old appearance",
        speech: "Old voice",
        description: "A future generated summary",
        eyes: "Grey-green",
        distinguishingFeatures: ["Scarred palm"],
        customFutureAttribute: { source: "continuity pass" },
      },
      "character",
      sharedInput,
    );

    expect(result).toMatchObject({
      appearance: sharedInput.appearance,
      speech: sharedInput.voice,
      eyes: "Grey-green",
      distinguishingFeatures: ["Scarred palm"],
      customFutureAttribute: { source: "continuity pass" },
      description: "A future generated summary",
    });
    expect(result).not.toHaveProperty("voice");
  });
});

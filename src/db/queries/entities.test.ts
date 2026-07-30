import { describe, expect, it } from "vitest";

import { mergeEntityAttrs } from "./entities";

describe("mergeEntityAttrs", () => {
  it("fills profile gaps without overwriting established physical canon", () => {
    const merged = mergeEntityAttrs(
      {
        role: "protagonist",
        appearance: "grey eyes and a weathered face",
        facts: ["Raised in Averrin"],
        personality: ["watchful"],
      },
      {
        appearance: "green eyes",
        hair: "black curls cut at the jaw",
        wardrobe: "waxed indigo coat",
        facts: ["Carries a brass compass", "Raised in Averrin"],
        personality: ["watchful", "stubborn"],
      },
    );

    expect(merged.appearance).toBe("grey eyes and a weathered face");
    expect(merged.hair).toBe("black curls cut at the jaw");
    expect(merged.wardrobe).toBe("waxed indigo coat");
    expect(merged.facts).toEqual(["Raised in Averrin", "Carries a brass compass"]);
    expect(merged.personality).toEqual(["watchful", "stubborn"]);
  });

  it("uses richer incoming values when the pre-seed only has empty defaults", () => {
    expect(
      mergeEntityAttrs(
        { background: "  ", mannerisms: [] },
        {
          background: "Raised in the archive stacks.",
          mannerisms: ["counts doorways under her breath"],
        },
      ),
    ).toMatchObject({
      background: "Raised in the archive stacks.",
      mannerisms: ["counts doorways under her breath"],
    });
  });
});

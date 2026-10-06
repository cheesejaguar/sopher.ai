import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { publishingKitSchema } from "@/lib/book-package";

import { normalizeMatterDraft, normalizePublishingKit } from "./publishing-kit";

/**
 * Anthropic strips length bounds from the schema it shows the model, so each
 * of these answers used to fail validation on a call the author paid for.
 */
describe("normalizePublishingKit", () => {
  const kit = {
    blurb: "A cartographer follows a river that has vanished from every map.",
    storeDescription: "Mara crosses a flooded country.",
    keywords: ["epic fantasy", "cartography"],
    categories: ["Fiction > Fantasy > Epic"],
    authorBio: "The author lives by the sea.",
  };

  it("keeps a well-formed kit intact", () => {
    expect(normalizePublishingKit(kit)).toEqual(kit);
  });

  it("survives eleven keywords and an over-long blurb", () => {
    const result = normalizePublishingKit({
      ...kit,
      blurb: "word ".repeat(400),
      keywords: Array.from({ length: 11 }, (_, index) => `keyword ${index}`),
    });
    expect(result.keywords).toHaveLength(10);
    expect(result.blurb.length).toBeLessThanOrEqual(1_200);
  });

  it("drops a keyword too long to be one rather than cutting it mid-phrase", () => {
    const result = normalizePublishingKit({ ...kit, keywords: ["x".repeat(61), "fantasy"] });
    expect(result.keywords).toEqual(["fantasy"]);
  });

  it("lands any provider output on the strict kit schema", () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(publishingKitSchema.safeParse(normalizePublishingKit(input)).success).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe("normalizeMatterDraft", () => {
  it("trims and bounds the page instead of failing an over-long draft", () => {
    expect(normalizeMatterDraft({ text: "  For Ada.  " })).toBe("For Ada.");
    expect(normalizeMatterDraft({ text: "word ".repeat(1_000) }).length).toBeLessThanOrEqual(3_000);
  });

  it("returns an empty page for an empty answer, which the route refunds", () => {
    expect(normalizeMatterDraft({ text: "   " })).toBe("");
    expect(normalizeMatterDraft(null)).toBe("");
  });
});

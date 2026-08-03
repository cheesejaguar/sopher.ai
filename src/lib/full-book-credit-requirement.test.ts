import { describe, expect, it } from "vitest";

import { estimateBookCost } from "@/ai/estimate";
import { creditsForUsd } from "@/lib/billing/credits-shared";
import { fullBookRequiredCredits } from "./full-book-credit-requirement";

describe("fullBookRequiredCredits", () => {
  it("matches the complete configuration quote shown before Start", () => {
    const shape = {
      tier: "standard" as const,
      targetChapters: 10,
      targetWordsPerChapter: 3000,
    };
    const quoted = creditsForUsd(
      estimateBookCost(shape.tier, shape.targetChapters, shape.targetWordsPerChapter).totalUsd,
    );

    expect(fullBookRequiredCredits(shape)).toBeGreaterThanOrEqual(quoted);
    expect(fullBookRequiredCredits(shape) - quoted).toBeLessThan(0.0001);
  });
});

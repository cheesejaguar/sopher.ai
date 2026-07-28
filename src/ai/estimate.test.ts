import { describe, expect, it } from "vitest";
import { estimateBookCost } from "./estimate";

describe("estimateBookCost", () => {
  it("orders tiers by cost and keeps totals positive", () => {
    const draft = estimateBookCost("draft", 12, 3000);
    const standard = estimateBookCost("standard", 12, 3000);
    const premium = estimateBookCost("premium", 12, 3000);
    expect(draft.totalUsd).toBeGreaterThan(0);
    expect(standard.totalUsd).toBeGreaterThan(draft.totalUsd);
    expect(premium.totalUsd).toBeGreaterThan(standard.totalUsd);
  });

  it("sums stages to the total (within rounding)", () => {
    const e = estimateBookCost("standard", 20, 3000);
    const stageSum = e.stages.reduce((acc, s) => acc + s.usd, 0);
    expect(Math.abs(stageSum - e.totalUsd)).toBeLessThan(0.05 * e.stages.length);
  });

  it("scales with book size and reports realistic durations", () => {
    const small = estimateBookCost("standard", 6, 1000);
    const large = estimateBookCost("standard", 40, 6000);
    expect(large.totalUsd).toBeGreaterThan(small.totalUsd * 4);
    expect(small.estimatedMinutes).toBeGreaterThanOrEqual(10);
    expect(large.estimatedMinutes).toBeGreaterThan(small.estimatedMinutes);
  });
});

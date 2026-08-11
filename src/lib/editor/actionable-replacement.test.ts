import { describe, expect, it } from "vitest";

import { isActionableReplacement } from "./actionable-replacement";

describe("isActionableReplacement", () => {
  it("rejects exact, Unicode-equivalent, and line-ending-only no-ops", () => {
    expect(isActionableReplacement("No change.", "No change.")).toBe(false);
    expect(isActionableReplacement("Caf\u00e9", "Cafe\u0301")).toBe(false);
    expect(isActionableReplacement("First\r\nSecond", "First\nSecond")).toBe(false);
    expect(isActionableReplacement("First\rSecond", "First\nSecond")).toBe(false);
  });

  it("preserves meaningful whitespace changes, deletions, and prose edits", () => {
    expect(isActionableReplacement("First\nSecond", "First\n\nSecond")).toBe(true);
    expect(isActionableReplacement("word", " word")).toBe(true);
    expect(isActionableReplacement("Cut this sentence.", "")).toBe(true);
    expect(isActionableReplacement("He walked.", "He ran.")).toBe(true);
  });
});

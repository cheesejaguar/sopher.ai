import { describe, expect, it } from "vitest";

import { planApplyAll, type ApplyAllSuggestion } from "./apply-all-plan";

const chapter = { id: "c1", content: "The quick brown fox jumps over the lazy dog.", version: 3 };

function suggestion(
  id: string,
  start: number,
  end: number,
  suggestedText: string,
  overrides: Partial<ApplyAllSuggestion> = {},
): ApplyAllSuggestion {
  return {
    id,
    chapterId: "c1",
    chapterVersion: 3,
    anchor: { start, end, originalText: chapter.content.slice(start, end) },
    suggestedText,
    ...overrides,
  };
}

describe("planApplyAll", () => {
  it("applies non-overlapping suggestions regardless of input order", () => {
    const plan = planApplyAll(
      [chapter],
      [suggestion("a", 4, 9, "slow"), suggestion("b", 35, 39, "sleepy")],
    );
    expect(plan).toMatchObject({ status: "ok", retiredIds: [] });
    if (plan.status !== "ok") throw new Error("expected ok");
    expect(plan.edits[0].content).toBe("The slow brown fox jumps over the sleepy dog.");
    expect(plan.edits[0].previousVersion).toBe(3);
    expect(plan.edits[0].suggestionIds.sort()).toEqual(["a", "b"]);
  });

  it("rejects overlapping ranges instead of splicing into a replacement", () => {
    // [10,19) "brown fox" and [4,15) "quick brown" share "brown".
    const plan = planApplyAll(
      [chapter],
      [suggestion("a", 10, 19, "red wolf"), suggestion("b", 4, 15, "slow grey")],
    );
    expect(plan).toEqual({ status: "conflict", chapterId: "c1", reason: "overlap" });
  });

  it("allows adjacent ranges that touch but do not overlap", () => {
    const plan = planApplyAll(
      [chapter],
      [suggestion("a", 4, 9, "slow"), suggestion("b", 9, 10, "-")],
    );
    expect(plan.status).toBe("ok");
    if (plan.status !== "ok") throw new Error("expected ok");
    expect(plan.edits[0].content).toBe("The slow-brown fox jumps over the lazy dog.");
  });

  it("aborts when a suggestion was made against an older chapter version", () => {
    const plan = planApplyAll([chapter], [suggestion("a", 4, 9, "slow", { chapterVersion: 2 })]);
    expect(plan).toEqual({ status: "conflict", chapterId: "c1", reason: "version" });
  });

  it("aborts when the quoted text no longer sits at its offsets", () => {
    const plan = planApplyAll(
      [chapter],
      [
        suggestion("a", 4, 9, "slow", {
          anchor: { start: 4, end: 9, originalText: "QUICK" },
        }),
      ],
    );
    expect(plan).toEqual({ status: "conflict", chapterId: "c1", reason: "moved" });
  });

  it("aborts when a suggestion's chapter is gone", () => {
    const plan = planApplyAll([], [suggestion("a", 4, 9, "slow")]);
    expect(plan).toEqual({ status: "conflict", chapterId: "c1", reason: "missing" });
  });

  it("retires no-op replacements rather than applying them", () => {
    const plan = planApplyAll([chapter], [suggestion("a", 4, 9, "quick")]);
    expect(plan).toEqual({ status: "ok", edits: [], retiredIds: ["a"] });
  });

  it("treats replacement text literally (no $-pattern expansion)", () => {
    const plan = planApplyAll([chapter], [suggestion("a", 4, 9, "$&$$")]);
    if (plan.status !== "ok") throw new Error("expected ok");
    expect(plan.edits[0].content).toBe("The $&$$ brown fox jumps over the lazy dog.");
  });
});

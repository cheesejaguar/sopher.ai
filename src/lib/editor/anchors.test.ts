import { describe, expect, it } from "vitest";

import { contextWindow, countWords, resolveAnchor } from "./anchors";

describe("resolveAnchor", () => {
  const content = "The harbor was quiet. The harbor was loud. End.";

  it("resolves the first occurrence", () => {
    expect(resolveAnchor(content, "The harbor was")).toEqual({ start: 0, end: 14 });
  });

  it("returns null when the quote is missing", () => {
    expect(resolveAnchor(content, "the lighthouse")).toBeNull();
    expect(resolveAnchor(content, "")).toBeNull();
  });

  it("round-trips through slice", () => {
    const range = resolveAnchor(content, "was loud")!;
    expect(content.slice(range.start, range.end)).toBe("was loud");
  });
});

describe("countWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("one two  three\n\nfour")).toBe(4);
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("contextWindow", () => {
  const words = Array.from({ length: 100 }, (_, i) => `w${i}`);
  const content = words.join(" ");
  const start = content.indexOf("w50");
  const end = start + "w50".length;

  it("reproduces a contiguous slice around the selection", () => {
    const { before, after } = contextWindow(content, start, end, 10);
    expect(before + content.slice(start, end) + after).toBe(
      content.slice(start - before.length, end + after.length),
    );
    expect(content.slice(start - before.length, start)).toBe(before);
  });

  it("caps each side at the word radius", () => {
    const { before, after } = contextWindow(content, start, end, 5);
    expect(before.trim().split(/\s+/)).toHaveLength(5);
    expect(after.trim().split(/\s+/)).toHaveLength(5);
    expect(before.trim()).toBe("w45 w46 w47 w48 w49");
    expect(after.trim()).toBe("w51 w52 w53 w54 w55");
  });

  it("handles selections at the document edges", () => {
    const first = contextWindow(content, 0, 2, 10);
    expect(first.before).toBe("");
    const last = contextWindow(content, content.length - 3, content.length, 10);
    expect(last.after).toBe("");
  });
});

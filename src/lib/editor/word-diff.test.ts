import { describe, expect, it } from "vitest";

import { wordDiff } from "./word-diff";

describe("wordDiff", () => {
  it("returns a single same-run for identical text", () => {
    expect(wordDiff("the quiet harbor", "the quiet harbor")).toEqual([
      { type: "same", text: "the quiet harbor" },
    ]);
  });

  it("marks a mid-span replacement as del + ins", () => {
    expect(wordDiff("the boat sank quickly", "the boat vanished quickly")).toEqual([
      { type: "same", text: "the boat" },
      { type: "del", text: "sank" },
      { type: "ins", text: "vanished" },
      { type: "same", text: "quickly" },
    ]);
  });

  it("handles pure insertion", () => {
    expect(wordDiff("she ran", "she ran fast")).toEqual([
      { type: "same", text: "she ran" },
      { type: "ins", text: "fast" },
    ]);
  });

  it("handles pure deletion", () => {
    expect(wordDiff("she ran very fast", "she ran fast")).toEqual([
      { type: "same", text: "she ran" },
      { type: "del", text: "very" },
      { type: "same", text: "fast" },
    ]);
  });

  it("handles empty sides", () => {
    expect(wordDiff("", "")).toEqual([]);
    expect(wordDiff("", "hello there")).toEqual([{ type: "ins", text: "hello there" }]);
    expect(wordDiff("hello there", "")).toEqual([{ type: "del", text: "hello there" }]);
  });

  it("normalizes whitespace runs to single spaces", () => {
    expect(wordDiff("a  b\n\nc", "a b c")).toEqual([{ type: "same", text: "a b c" }]);
  });

  it("merges adjacent ops of the same type", () => {
    const ops = wordDiff("one two three", "four five six");
    expect(ops).toEqual([
      { type: "del", text: "one two three" },
      { type: "ins", text: "four five six" },
    ]);
  });

  it("falls back to a whole-span swap for very long inputs", () => {
    const before = Array.from({ length: 500 }, (_, i) => `w${i}`).join(" ");
    const after = Array.from({ length: 500 }, (_, i) => `x${i}`).join(" ");
    const ops = wordDiff(before, after);
    expect(ops).toHaveLength(2);
    expect(ops[0].type).toBe("del");
    expect(ops[1].type).toBe("ins");
  });

  it("round-trips: same+del reconstructs before, same+ins reconstructs after", () => {
    const before = "the storm rolled east and the water calmed at last";
    const after = "the storm finally rolled east and the sea calmed";
    const ops = wordDiff(before, after);
    const rebuiltBefore = ops
      .filter((o) => o.type !== "ins")
      .map((o) => o.text)
      .join(" ");
    const rebuiltAfter = ops
      .filter((o) => o.type !== "del")
      .map((o) => o.text)
      .join(" ");
    expect(rebuiltBefore).toBe(before);
    expect(rebuiltAfter).toBe(after);
  });
});

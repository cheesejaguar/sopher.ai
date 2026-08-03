import { describe, expect, it } from "vitest";

import { chapterSplitPoints, mergeChapterContent, splitChapterContent } from "./chapter-split";

const chapter = [
  "The ferry came in low and late.",
  "Mara counted the crates twice, then a third time.",
  "By dusk the water had turned the colour of old tin.",
].join("\n\n");

describe("splitChapterContent", () => {
  it("keeps every character apart from the whitespace at the seam", () => {
    const offset = chapter.indexOf("Mara");
    const halves = splitChapterContent(chapter, offset);
    expect(halves).not.toBeNull();
    expect(halves?.before).toBe("The ferry came in low and late.");
    expect(halves?.after.startsWith("Mara counted")).toBe(true);
    expect(`${halves?.before}${halves?.after}`.replace(/\s/g, "")).toBe(chapter.replace(/\s/g, ""));
  });

  it("honours an offset inside a word, because the cursor may sit there", () => {
    const halves = splitChapterContent("alpha beta", 5);
    expect(halves).toEqual({ before: "alpha", after: "beta" });
  });

  it("refuses a cut that would leave a blank chapter on either side", () => {
    expect(splitChapterContent(chapter, 0)).toBeNull();
    expect(splitChapterContent(chapter, chapter.length)).toBeNull();
    // Only whitespace precedes this offset.
    expect(splitChapterContent("\n\n  Prose.", 4)).toBeNull();
  });

  it("rejects offsets that are not a real position in the text", () => {
    expect(splitChapterContent(chapter, -1)).toBeNull();
    expect(splitChapterContent(chapter, chapter.length + 1)).toBeNull();
    expect(splitChapterContent(chapter, 1.5)).toBeNull();
    expect(splitChapterContent(chapter, Number.NaN)).toBeNull();
  });
});

describe("chapterSplitPoints", () => {
  it("offers every paragraph start except the first", () => {
    const points = chapterSplitPoints(chapter);
    expect(points).toHaveLength(2);
    expect(points[0].preview.startsWith("Mara counted the crates")).toBe(true);
    expect(points[1].preview.startsWith("By dusk the water")).toBe(true);
  });

  it("returns offsets that split cleanly", () => {
    for (const point of chapterSplitPoints(chapter)) {
      const halves = splitChapterContent(chapter, point.offset);
      expect(halves).not.toBeNull();
      expect(halves?.after.startsWith(point.preview.slice(0, 20))).toBe(true);
    }
  });

  it("treats a run of blank lines as one break and ignores trailing blanks", () => {
    const spaced = "One.\n\n\n \n\nTwo.\n\n\n";
    const points = chapterSplitPoints(spaced);
    expect(points).toHaveLength(1);
    expect(points[0].preview).toBe("Two.");
  });

  it("has nothing to offer a single-paragraph chapter", () => {
    expect(chapterSplitPoints("One unbroken block of prose.")).toEqual([]);
  });

  it("collapses and truncates long previews", () => {
    const long = `Opening.\n\n${"word ".repeat(200)}`;
    const [point] = chapterSplitPoints(long);
    expect(point.preview.length).toBeLessThanOrEqual(141);
    expect(point.preview.endsWith("…")).toBe(true);
    expect(point.preview).not.toContain("\n");
  });

  it("caps how many split points reach the client", () => {
    const many = Array.from({ length: 50 }, (_, i) => `Paragraph ${i}.`).join("\n\n");
    expect(chapterSplitPoints(many, 10)).toHaveLength(10);
  });
});

describe("mergeChapterContent", () => {
  it("joins with a single blank line", () => {
    expect(mergeChapterContent("First.\n\n", "\n  Second.")).toBe("First.\n\nSecond.");
  });

  it("keeps a custom title from the absorbed chapter as a heading", () => {
    expect(mergeChapterContent("First.", "Second.", "Storm Glass")).toBe(
      "First.\n\n## Storm Glass\n\nSecond.",
    );
  });

  it("drops a default or missing title rather than inventing a heading", () => {
    expect(mergeChapterContent("First.", "Second.", null)).toBe("First.\n\nSecond.");
    expect(mergeChapterContent("First.", "Second.", "   ")).toBe("First.\n\nSecond.");
  });

  it("never leaves a heading with nothing under it", () => {
    expect(mergeChapterContent("First.", "   ", "Storm Glass")).toBe("First.");
  });

  it("survives an empty first chapter", () => {
    expect(mergeChapterContent("", "Second.")).toBe("Second.");
  });

  it("round-trips a split", () => {
    const halves = splitChapterContent(chapter, chapter.indexOf("By dusk"));
    expect(mergeChapterContent(halves!.before, halves!.after)).toBe(chapter);
  });
});

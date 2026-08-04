import { describe, expect, it } from "vitest";

import { buildManuscript, manuscriptToMarkdown } from "@/lib/export/assemble";

import { classifyHeading, importedBookMatter, parseChapterNumber, splitManuscript } from "./split";

/** Deterministic filler so word-count thresholds are exercised, not guessed at. */
function prose(words: number, tag = "word"): string {
  return Array.from({ length: words }, (_, index) => `${tag}${index}`).join(" ");
}

describe("parseChapterNumber", () => {
  it("reads arabic, roman and written numbers", () => {
    expect(parseChapterNumber("7")).toBe(7);
    expect(parseChapterNumber("xiv")).toBe(14);
    expect(parseChapterNumber("IX")).toBe(9);
    expect(parseChapterNumber("three")).toBe(3);
    expect(parseChapterNumber("twenty-one")).toBe(21);
    expect(parseChapterNumber("Forty Two")).toBe(42);
  });

  it("rejects words that are not numbers", () => {
    expect(parseChapterNumber("notes")).toBeNull();
    expect(parseChapterNumber("")).toBeNull();
    expect(parseChapterNumber("constructor")).toBeNull();
  });
});

describe("classifyHeading", () => {
  it("separates the number from the title", () => {
    expect(classifyHeading("Chapter 4 — Salt")).toEqual({
      kind: "chapter",
      number: 4,
      title: "Salt",
    });
    expect(classifyHeading("CHAPTER TWELVE: The Wreck")).toEqual({
      kind: "chapter",
      number: 12,
      title: "The Wreck",
    });
    expect(classifyHeading("**Chapter 2**")).toEqual({ kind: "chapter", number: 2, title: null });
  });

  it("does not eat a title that begins with a number word", () => {
    expect(classifyHeading("Chapter Two Weeks Later")).toEqual({
      kind: "chapter",
      number: 2,
      title: "Weeks Later",
    });
  });

  it("keeps a prologue's own name", () => {
    expect(classifyHeading("Prologue")).toEqual({
      kind: "chapter",
      number: null,
      title: "Prologue",
    });
  });

  it("recognizes book matter, including the misspelling authors actually type", () => {
    expect(classifyHeading("Acknowledgements")).toEqual({
      kind: "matter",
      key: "acknowledgments",
    });
    expect(classifyHeading("Author’s Note")).toEqual({ kind: "matter", key: "authorNote" });
    expect(classifyHeading("Contents")).toEqual({ kind: "matter", key: null });
  });

  it("treats part dividers as dividers and everything else as a plain heading", () => {
    expect(classifyHeading("Part Two")).toEqual({ kind: "divider" });
    expect(classifyHeading("The Drowned Coast")).toEqual({ kind: "other" });
    expect(classifyHeading("Chapters I Have Loved")).toEqual({ kind: "other" });
  });
});

describe("splitManuscript — ATX chapter headings", () => {
  const source = [
    "# The Salt Road",
    "",
    "## Chapter 1 — Low Water",
    "",
    prose(30, "a"),
    "",
    "### A scene inside chapter one",
    "",
    prose(20, "b"),
    "",
    "## Chapter 2",
    "",
    prose(25, "c"),
  ].join("\n");

  const result = splitManuscript(source);

  it("uses the chapter headings and reports the strategy", () => {
    expect(result.strategy).toBe("chapter-heading");
    expect(result.chapters).toHaveLength(2);
  });

  it("takes the book title from the leading H1", () => {
    expect(result.title).toBe("The Salt Road");
  });

  it("keeps deeper headings inside the chapter body", () => {
    expect(result.chapters[0].title).toBe("Low Water");
    expect(result.chapters[0].markdown).toContain("### A scene inside chapter one");
    expect(result.chapters[0].wordCount).toBe(
      30 + 20 + "### A scene inside chapter one".split(" ").length,
    );
  });

  it("leaves a numbered-only chapter untitled", () => {
    expect(result.chapters[1].title).toBeNull();
  });
});

describe("splitManuscript — priority order", () => {
  it("prefers chapter headings over the other heading levels in the document", () => {
    const result = splitManuscript(
      [
        "# Front Matter Heading",
        "",
        "# Another Top Heading",
        "",
        "## Chapter 1",
        "",
        prose(40),
        "",
        "## Chapter 2",
        "",
        prose(40),
      ].join("\n"),
    );
    expect(result.strategy).toBe("chapter-heading");
    expect(result.chapters.map((chapter) => chapter.title)).toEqual([null, null]);
  });

  it("falls back to any heading level used twice when no chapter is named", () => {
    const result = splitManuscript(
      ["## Low Water", "", prose(30), "", "## Storm Glass", "", prose(30)].join("\n"),
    );
    expect(result.strategy).toBe("heading");
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["Low Water", "Storm Glass"]);
  });

  it("splits on standalone CHAPTER lines when there are no headings at all", () => {
    const result = splitManuscript(
      ["CHAPTER ONE", "", prose(30), "", "CHAPTER TWO", "", prose(30)].join("\n"),
    );
    expect(result.strategy).toBe("chapter-line");
    expect(result.chapters).toHaveLength(2);
  });

  it("lifts setext headings and says so", () => {
    const result = splitManuscript(
      [
        "Low Water",
        "=========",
        "",
        prose(30),
        "",
        "Storm Glass",
        "===========",
        "",
        prose(30),
      ].join("\n"),
    );
    expect(result.strategy).toBe("setext-heading");
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["Low Water", "Storm Glass"]);
  });

  it("splits on form feeds when nothing else is there", () => {
    const result = splitManuscript([prose(30, "a"), "\f", prose(30, "b")].join("\n"));
    expect(result.strategy).toBe("form-feed");
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[1].markdown.startsWith("b0")).toBe(true);
    expect(result.chapters[0].markdown).not.toContain("\f");
  });

  it("produces a single chapter rather than failing", () => {
    const result = splitManuscript(prose(50));
    expect(result.strategy).toBe("single");
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].wordCount).toBe(50);
  });

  it("returns nothing for an empty document", () => {
    expect(splitManuscript("   \n\n  ").chapters).toEqual([]);
    expect(splitManuscript("").totalWords).toBe(0);
  });
});

describe("splitManuscript — false boundaries", () => {
  it("ignores a paragraph that happens to open with a chapter reference", () => {
    const result = splitManuscript(
      [
        "CHAPTER ONE",
        "",
        prose(20),
        "",
        "Chapter 3 was the year the harbour froze over.",
        "",
        prose(20),
      ].join("\n"),
    );
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].markdown).toContain("Chapter 3 was the year");
  });

  it("does not read a scene break as a setext underline", () => {
    const result = splitManuscript(
      [prose(20, "a"), "", "---", "", prose(20, "b"), "", "---", "", prose(20, "c")].join("\n"),
    );
    expect(result.strategy).toBe("single");
    expect(result.chapters[0].markdown).toContain("---");
  });

  it("ignores headings inside fenced code", () => {
    const result = splitManuscript(
      ["```", "# Chapter 1", "```", "", prose(30), "", "```", "# Chapter 2", "```"].join("\n"),
    );
    expect(result.strategy).toBe("single");
    expect(result.chapters).toHaveLength(1);
  });

  it("keeps a part divider out of the chapter list but not its scenes", () => {
    const result = splitManuscript(
      [
        "# Part One",
        "",
        "## Chapter 1",
        "",
        prose(30),
        "",
        "# Part Two",
        "",
        "## Chapter 2",
        "",
        prose(30),
      ].join("\n"),
    );
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters.every((chapter) => !chapter.markdown.includes("Part Two"))).toBe(true);
  });
});

describe("splitManuscript — nothing is silently dropped", () => {
  it("keeps an untitled opening ahead of the first chapter", () => {
    const result = splitManuscript(
      [
        prose(150, "open"),
        "",
        "## Chapter 1",
        "",
        prose(30),
        "",
        "## Chapter 2",
        "",
        prose(30),
      ].join("\n"),
    );
    expect(result.chapters).toHaveLength(3);
    expect(result.chapters[0].title).toBeNull();
    expect(result.chapters[0].markdown.startsWith("open0")).toBe(true);
  });

  it("renumbers from one but keeps the author's own numbering visible", () => {
    const result = splitManuscript(
      ["## Chapter 7", "", prose(30), "", "## Chapter 8", "", prose(30)].join("\n"),
    );
    expect(result.chapters.map((chapter) => [chapter.number, chapter.title])).toEqual([
      [1, "Chapter 7"],
      [2, "Chapter 8"],
    ]);
  });

  it("puts a prologue first and shifts the numbering honestly", () => {
    const result = splitManuscript(
      ["## Prologue", "", prose(30), "", "## Chapter 1", "", prose(30)].join("\n"),
    );
    expect(result.chapters.map((chapter) => [chapter.number, chapter.title])).toEqual([
      [1, "Prologue"],
      [2, "Chapter 1"],
    ]);
  });

  it("keeps a document that is only front matter rather than importing nothing", () => {
    const result = splitManuscript(["## Preface", "", prose(40)].join("\n"));
    expect(result.chapters).toHaveLength(1);
    expect(result.matter).toEqual([]);
    expect(result.chapters[0].markdown).toContain("## Preface");
  });
});

describe("splitManuscript — round-trips our own export", () => {
  const manuscript = buildManuscript({
    title: "The Salt Road",
    synopsis: "A ferryman's daughter smuggles hope across a drowned coast.",
    genre: "Literary fiction",
    matter: {
      author: "E. Marlowe",
      dedication: "For everyone still waiting at the harbour.",
      epigraphText: "The sea keeps its own books.",
      epigraphAttribution: "Old proverb",
      foreword: "This edition restores the passages cut in 1974.",
      acknowledgments: "Thanks to the lighthouse keepers.",
      copyrightHolder: "E. Marlowe",
      copyrightYear: 2026,
    },
    chapters: [
      { number: 1, title: null, content: `${prose(40, "one")}\n\n***\n\n${prose(40, "oneb")}` },
      { number: 2, title: "Storm Glass", content: prose(60, "two") },
      { number: 3, title: "Low Water", content: prose(50, "three") },
    ],
  });
  const exported = manuscriptToMarkdown(manuscript);
  const result = splitManuscript(exported);

  it("recovers exactly the chapters that were exported", () => {
    expect(result.strategy).toBe("chapter-heading");
    expect(result.chapters.map((chapter) => [chapter.number, chapter.title])).toEqual([
      [1, null],
      [2, "Storm Glass"],
      [3, "Low Water"],
    ]);
  });

  it("recovers the title and the prose byte for byte", () => {
    expect(result.title).toBe("The Salt Road");
    expect(result.chapters[1].markdown).toBe(manuscript.chapters[1].markdown);
    expect(result.chapters[2].markdown).toBe(manuscript.chapters[2].markdown);
  });

  it("keeps a scene break that lives inside a chapter", () => {
    expect(result.chapters[0].markdown).toBe(manuscript.chapters[0].markdown);
    expect(result.chapters[0].markdown).toContain("***");
  });

  it("takes the title page, contents and copyright out of the chapter list", () => {
    const skipped = result.matter.map((section) => section.title);
    expect(skipped).toContain("Contents");
    expect(skipped).toContain("Copyright");
    expect(
      result.chapters.some((chapter) => chapter.markdown.includes("All rights reserved")),
    ).toBe(false);
  });

  it("puts front and back matter back where it came from", () => {
    expect(importedBookMatter(result.matter)).toEqual({
      dedication: "For everyone still waiting at the harbour.",
      epigraphText: "The sea keeps its own books.",
      epigraphAttribution: "Old proverb",
      foreword: "This edition restores the passages cut in 1974.",
      acknowledgments: "Thanks to the lighthouse keepers.",
    });
  });
});

describe("importedBookMatter", () => {
  it("ignores sections it cannot store and clamps the ones it can", () => {
    expect(
      importedBookMatter([
        { key: null, title: "Contents", markdown: "1. One", wordCount: 2 },
        {
          key: "dedication",
          title: "Dedication",
          markdown: "*".repeat(1) + "x".repeat(4_000),
          wordCount: 1,
        },
      ]).dedication?.length,
    ).toBe(2_000);
  });
});

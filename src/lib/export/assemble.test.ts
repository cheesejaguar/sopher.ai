import { describe, expect, it } from "vitest";

import {
  buildManuscript,
  chapterHeading,
  manuscriptToMarkdown,
  markdownToBlocks,
  markdownToHtml,
  parseInline,
  stripInline,
  MANUSCRIPT_AUTHOR,
} from "./assemble";
import { filenameStem } from "./types";

const source = {
  title: "The Salt Road",
  synopsis: "A ferryman's daughter smuggles hope across a drowned coast.",
  genre: "Literary fiction",
  chapters: [
    { number: 2, title: "Storm Glass", content: "Second chapter prose.\n\nWith two paragraphs." },
    { number: 1, title: null, content: "  First chapter prose. Five words here.  " },
    { number: 3, title: "Empty", content: "   " },
  ],
};

describe("buildManuscript", () => {
  const m = buildManuscript(source);

  it("filters empty chapters and orders by number", () => {
    expect(m.chapters.map((c) => c.number)).toEqual([1, 2]);
  });

  it("fills default titles and trims content", () => {
    expect(m.chapters[0].title).toBe("Chapter 1");
    expect(m.chapters[0].markdown).toBe("First chapter prose. Five words here.");
    expect(m.chapters[1].title).toBe("Storm Glass");
  });

  it("computes word counts", () => {
    expect(m.chapters[0].wordCount).toBe(6);
    expect(m.totalWords).toBe(6 + 6);
  });

  it("stamps the sopher.ai byline", () => {
    expect(m.author).toBe(MANUSCRIPT_AUTHOR);
    expect(m.author).toBe("Written with sopher.ai");
  });
});

describe("chapterHeading", () => {
  it("collapses default titles", () => {
    expect(chapterHeading({ number: 1, title: "Chapter 1" })).toBe("Chapter 1");
  });
  it("joins real titles with an em dash", () => {
    expect(chapterHeading({ number: 2, title: "Storm Glass" })).toBe("Chapter 2 — Storm Glass");
  });
});

describe("manuscriptToMarkdown", () => {
  it("assembles the exact deterministic document", () => {
    const md = manuscriptToMarkdown(buildManuscript(source));
    expect(md).toBe(
      [
        "# The Salt Road",
        "",
        "*A ferryman's daughter smuggles hope across a drowned coast.*",
        "",
        "Written with sopher.ai",
        "",
        "## Contents",
        "",
        "1. Chapter 1",
        "2. Storm Glass",
        "",
        "***",
        "",
        "## Chapter 1",
        "",
        "First chapter prose. Five words here.",
        "",
        "***",
        "",
        "## Chapter 2 — Storm Glass",
        "",
        "Second chapter prose.",
        "",
        "With two paragraphs.",
        "",
      ].join("\n"),
    );
  });

  it("omits the synopsis line when absent", () => {
    const md = manuscriptToMarkdown(
      buildManuscript({
        title: "Untitled",
        chapters: [{ number: 1, title: null, content: "Hi." }],
      }),
    );
    expect(md.startsWith("# Untitled\n\nWritten with sopher.ai\n")).toBe(true);
  });
});

describe("markdownToBlocks", () => {
  it("parses headings, quotes, scene breaks, and paragraphs", () => {
    const blocks = markdownToBlocks(
      "# Dawn\n\nFirst line\ncontinues here.\n\n> A quoted\n> letter.\n\n---\n\nAfter the break.",
    );
    expect(blocks).toEqual([
      { kind: "heading", depth: 1, text: "Dawn" },
      { kind: "paragraph", text: "First line continues here." },
      { kind: "quote", text: "A quoted letter." },
      { kind: "scene-break" },
      { kind: "paragraph", text: "After the break." },
    ]);
  });

  it("clamps heading depth to 3", () => {
    expect(markdownToBlocks("##### Deep")).toEqual([{ kind: "heading", depth: 3, text: "Deep" }]);
  });
});

describe("inline parsing", () => {
  it("splits bold and italic runs", () => {
    expect(parseInline("A **bold** and *quiet* _word_")).toEqual([
      { text: "A " },
      { text: "bold", bold: true },
      { text: " and " },
      { text: "quiet", italic: true },
      { text: " " },
      { text: "word", italic: true },
    ]);
  });

  it("strips markers for plain sinks", () => {
    expect(stripInline("A **bold** and *quiet* word")).toBe("A bold and quiet word");
  });
});

describe("markdownToHtml", () => {
  it("renders emphasis and escapes raw HTML", () => {
    const html = markdownToHtml("Hello <script>alert(1)</script> *world*");
    expect(html).toContain("<em>world</em>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("filenameStem", () => {
  it("slugs titles and falls back for empty ones", () => {
    expect(filenameStem("The Salt Road!")).toBe("the-salt-road");
    expect(filenameStem("   ")).toBe("manuscript");
  });
});

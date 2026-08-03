import { describe, expect, it } from "vitest";

import { MANUSCRIPT_AUTHOR, manuscriptToMarkdown } from "./assemble";
import { buildChapterManuscript, chapterFilenameStem } from "./chapter";
import { exportMarkdown } from "./markdown";

const matter = {
  author: "R. Okonkwo",
  subtitle: "A novel of the drowned coast",
  dedication: "For everyone still bailing.",
  copyrightHolder: "R. Okonkwo",
  copyrightYear: 2026,
  isbn: "978-0-00-000000-0",
  afterword: "How the ferry was built.",
  coverUrl: "https://example.com/cover.png",
};

const chapter = {
  number: 4,
  title: "Storm Glass",
  content: "The ferry came in low and late.\n\nMara counted the crates twice.",
};

describe("buildChapterManuscript", () => {
  const m = buildChapterManuscript({ bookTitle: "The Salt Road", matter, chapter });

  it("carries exactly the one chapter", () => {
    expect(m.chapters).toHaveLength(1);
    expect(m.chapters[0].number).toBe(4);
    expect(m.chapters[0].title).toBe("Storm Glass");
    expect(m.totalWords).toBe(m.chapters[0].wordCount);
  });

  it("titles the file after the chapter, not the book", () => {
    expect(m.title).toBe("Storm Glass");
  });

  it("falls back to the numbered title for an untitled chapter", () => {
    const untitled = buildChapterManuscript({
      bookTitle: "The Salt Road",
      chapter: { ...chapter, title: null },
    });
    expect(untitled.title).toBe("Chapter 4");
    expect(untitled.chapters[0].title).toBe("Chapter 4");
  });

  it("says on the page which book the chapter came from", () => {
    expect(m.editionNote).toBe("Chapter 4 of The Salt Road");
  });

  it("keeps the byline but leaves the book's own matter behind", () => {
    expect(m.author).toBe("R. Okonkwo");
    expect(m.matter).toEqual({ author: "R. Okonkwo" });
    expect(m.coverUrl).toBeNull();
    expect(m.synopsis).toBeNull();
  });

  it("falls back to the house byline when the author never set one", () => {
    const anonymous = buildChapterManuscript({ bookTitle: "The Salt Road", chapter });
    expect(anonymous.author).toBe(MANUSCRIPT_AUTHOR);
  });

  it("renders through the untouched whole-book renderers", () => {
    const markdown = manuscriptToMarkdown(m);
    expect(markdown).toContain("# Storm Glass");
    expect(markdown).toContain("_Chapter 4 of The Salt Road_");
    expect(markdown).toContain("## Chapter 4 — Storm Glass");
    expect(markdown).toContain("The ferry came in low and late.");
    // Book-level matter must not ride along on an excerpt.
    expect(markdown).not.toContain("For everyone still bailing.");
    expect(markdown).not.toContain("978-0-00-000000-0");
    expect(markdown).not.toContain("How the ferry was built.");
    expect(markdown).not.toContain("A novel of the drowned coast");
  });

  it("produces bytes the download route can stream", () => {
    const result = exportMarkdown(m);
    expect(result.contentType).toContain("text/markdown");
    expect(new TextDecoder().decode(result.buffer)).toContain("Mara counted the crates twice.");
  });

  it("names an untitled book rather than printing an empty edition note", () => {
    const nameless = buildChapterManuscript({ bookTitle: "   ", chapter });
    expect(nameless.editionNote).toBe("Chapter 4 of Untitled book");
  });
});

describe("chapterFilenameStem", () => {
  it("groups by book and sorts by chapter", () => {
    expect(chapterFilenameStem("The Salt Road", 4)).toBe("the-salt-road-chapter-4");
  });

  it("reduces to characters that are safe inside a quoted header", () => {
    const stem = chapterFilenameStem('Quote " and\r\nnewline; drop', 12);
    expect(stem).toMatch(/^[a-z0-9-]+$/);
    expect(stem.endsWith("-chapter-12")).toBe(true);
  });

  it("stays usable when the book has no title", () => {
    expect(chapterFilenameStem("", 1)).toBe("manuscript-chapter-1");
  });

  it("refuses to put a nonsense number in the filename", () => {
    expect(chapterFilenameStem("Book", Number.NaN)).toBe("book-chapter-0");
    expect(chapterFilenameStem("Book", -3)).toBe("book-chapter-0");
    expect(chapterFilenameStem("Book", 2.7)).toBe("book-chapter-2");
  });
});

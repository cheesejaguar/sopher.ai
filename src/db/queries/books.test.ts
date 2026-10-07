import { describe, expect, it } from "vitest";

import {
  isSoftRetiredManuscriptChapter,
  isVisibleManuscriptChapter,
  archivedChapterRecovery,
} from "./books";

describe("isVisibleManuscriptChapter", () => {
  it("hides only the empty planned placeholder used to retain reduced-run history", () => {
    const retired = {
      status: "planned" as const,
      title: null,
      summary: null,
      wordCount: 0,
    };
    expect(isSoftRetiredManuscriptChapter(retired)).toBe(true);
    expect(isVisibleManuscriptChapter(retired)).toBe(false);
  });

  it.each([
    {
      label: "an outlined chapter",
      chapter: {
        status: "planned" as const,
        title: "Arrival",
        summary: "The journey begins.",
        wordCount: 0,
      },
    },
    {
      label: "a manually inserted blank chapter",
      chapter: { status: "drafted" as const, title: null, summary: null, wordCount: 0 },
    },
    {
      label: "a drafted chapter",
      chapter: { status: "drafted" as const, title: "Arrival", summary: null, wordCount: 1_200 },
    },
  ])("keeps $label visible", ({ chapter }) => {
    expect(isVisibleManuscriptChapter(chapter)).toBe(true);
  });
});

describe("archivedChapterRecovery", () => {
  it("passes a short normalized excerpt through with its snapshot metadata", () => {
    expect(
      archivedChapterRecovery({
        chapterId: "chapter-11",
        chapterNumber: 11,
        revisionId: "revision-eleven",
        createdAt: new Date("2026-07-21T10:00:00.000Z"),
        wordCount: 9,
        excerptSource: "The bell rang twice before Mara entered the archive.",
      }),
    ).toEqual({
      chapterId: "chapter-11",
      chapterNumber: 11,
      revisionId: "revision-eleven",
      archivedAt: new Date("2026-07-21T10:00:00.000Z"),
      wordCount: 9,
      excerpt: "The bell rang twice before Mara entered the archive.",
    });
  });

  it("truncates a source that runs past the excerpt without exposing the full draft", () => {
    // The query returns one character past the excerpt when the draft continues.
    const excerptSource = Array.from({ length: 90 }, (_, index) => `word${index}`)
      .join(" ")
      .slice(0, 281);
    const recovery = archivedChapterRecovery({
      chapterId: "chapter-9",
      chapterNumber: 9,
      revisionId: "revision-9",
      createdAt: new Date("2026-07-23T10:00:00.000Z"),
      wordCount: 90,
      excerptSource,
    });

    expect(recovery.wordCount).toBe(90);
    expect(recovery.excerpt.endsWith("…")).toBe(true);
    expect(recovery.excerpt.length).toBeLessThanOrEqual(281);
  });

  it("keeps an excerpt of exactly the limit whole", () => {
    const excerptSource = "a".repeat(280);
    const recovery = archivedChapterRecovery({
      chapterId: "chapter-3",
      chapterNumber: 3,
      revisionId: "revision-3",
      createdAt: new Date("2026-07-23T10:00:00.000Z"),
      wordCount: 1,
      excerptSource,
    });

    expect(recovery.excerpt).toBe(excerptSource);
  });
});

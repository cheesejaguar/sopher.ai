import { describe, expect, it } from "vitest";

import {
  isSoftRetiredManuscriptChapter,
  isVisibleManuscriptChapter,
  latestArchivedChapterRecoveries,
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

describe("latestArchivedChapterRecoveries", () => {
  it("keeps the newest generation-reset snapshot per retired chapter", () => {
    const rows = [
      {
        chapterId: "chapter-12",
        chapterNumber: 12,
        revisionId: "revision-old",
        content: "An older version of the final crossing.",
        createdAt: new Date("2026-07-20T10:00:00.000Z"),
      },
      {
        chapterId: "chapter-11",
        chapterNumber: 11,
        revisionId: "revision-eleven",
        content: "The bell rang twice before Mara entered the archive.",
        createdAt: new Date("2026-07-21T10:00:00.000Z"),
      },
      {
        chapterId: "chapter-12",
        chapterNumber: 12,
        revisionId: "revision-new",
        content: "The final crossing began at low tide.",
        createdAt: new Date("2026-07-22T10:00:00.000Z"),
      },
    ];

    expect(latestArchivedChapterRecoveries(rows)).toEqual([
      {
        chapterId: "chapter-11",
        chapterNumber: 11,
        revisionId: "revision-eleven",
        archivedAt: new Date("2026-07-21T10:00:00.000Z"),
        wordCount: 9,
        excerpt: "The bell rang twice before Mara entered the archive.",
      },
      {
        chapterId: "chapter-12",
        chapterNumber: 12,
        revisionId: "revision-new",
        archivedAt: new Date("2026-07-22T10:00:00.000Z"),
        wordCount: 7,
        excerpt: "The final crossing began at low tide.",
      },
    ]);
  });

  it("normalizes and truncates an archived excerpt without exposing the full draft", () => {
    const content = Array.from({ length: 90 }, (_, index) => `word${index}`).join(" \n ");
    const [recovery] = latestArchivedChapterRecoveries([
      {
        chapterId: "chapter-9",
        chapterNumber: 9,
        revisionId: "revision-9",
        content,
        createdAt: new Date("2026-07-23T10:00:00.000Z"),
      },
    ]);

    expect(recovery.wordCount).toBe(90);
    expect(recovery.excerpt).not.toContain("\n");
    expect(recovery.excerpt.endsWith("…")).toBe(true);
    expect(recovery.excerpt.length).toBeLessThanOrEqual(281);
  });
});

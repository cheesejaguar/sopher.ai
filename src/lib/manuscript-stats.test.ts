import { describe, expect, it } from "vitest";

import { WORDS_PER_PAGE as WIZARD_WORDS_PER_PAGE } from "@/components/wizard/wizard-state";
import { bookMatterPageCount, readBookMatter } from "@/lib/book-package";

import {
  bookReadingOrder,
  chapterPace,
  describeChapterPace,
  estimatePages,
  estimateReadingMinutes,
  formatReadingTime,
  manuscriptStats,
  WORDS_PER_PAGE,
} from "./manuscript-stats";

describe("page and reading-time estimates", () => {
  it("uses the same words-per-page figure the wizard quoted at purchase", () => {
    expect(WORDS_PER_PAGE).toBe(WIZARD_WORDS_PER_PAGE);
  });

  it("rounds a part-full page up, because the next chapter starts a new one", () => {
    expect(estimatePages(0)).toBe(0);
    expect(estimatePages(1)).toBe(1);
    expect(estimatePages(WORDS_PER_PAGE)).toBe(1);
    expect(estimatePages(WORDS_PER_PAGE + 1)).toBe(2);
  });

  it("never reports zero minutes for prose that exists", () => {
    expect(estimateReadingMinutes(0)).toBe(0);
    expect(estimateReadingMinutes(12)).toBe(1);
    expect(estimateReadingMinutes(2_300)).toBe(10);
  });

  it("reads hours back as hours", () => {
    expect(formatReadingTime(0)).toBe("0 min");
    expect(formatReadingTime(48)).toBe("48 min");
    expect(formatReadingTime(180)).toBe("3 hr");
    expect(formatReadingTime(200)).toBe("3 hr 20 min");
  });
});

describe("chapter pace", () => {
  it("keeps quiet inside the tolerance band and speaks outside it", () => {
    expect(chapterPace(0, 3_000)).toBe("empty");
    expect(chapterPace(2_800, 3_000)).toBe("on_target");
    expect(chapterPace(3_300, 3_000)).toBe("on_target");
    expect(chapterPace(3_301, 3_000)).toBe("over");
    expect(chapterPace(2_699, 3_000)).toBe("under");
  });

  it("treats a missing target as nothing to miss", () => {
    expect(chapterPace(1_200, 0)).toBe("on_target");
  });

  it("describes the drift in words for assistive technology", () => {
    const stats = manuscriptStats({
      chapters: [
        { number: 1, words: 4_200 },
        { number: 2, words: 0 },
      ],
      targetChapters: 2,
      targetWordsPerChapter: 3_000,
    });

    expect(describeChapterPace(stats.chapters[0])).toBe(
      "Chapter 1: 4,200 words, 1,200 over the 3,000-word target.",
    );
    expect(describeChapterPace(stats.chapters[1])).toBe("Chapter 2 is not written yet.");
  });
});

describe("manuscript stats", () => {
  const input = {
    chapters: [
      { number: 2, title: "  The Orchard Below  ", words: 3_100 },
      { number: 1, title: null, words: 2_000 },
      { number: 3, words: 0 },
    ],
    targetChapters: 3,
    targetWordsPerChapter: 3_000,
  };

  it("orders chapters and measures each against the per-chapter target", () => {
    const stats = manuscriptStats(input);

    expect(stats.chapters.map((chapter) => chapter.number)).toEqual([1, 2, 3]);
    expect(stats.chapters[1].title).toBe("The Orchard Below");
    expect(stats.chapters[0].delta).toBe(-1_000);
    expect(stats.chapters.map((chapter) => chapter.pace)).toEqual(["under", "on_target", "empty"]);
  });

  it("totals the book against its word goal without exceeding 100%", () => {
    const stats = manuscriptStats(input);

    expect(stats.words).toBe(5_100);
    expect(stats.targetWords).toBe(9_000);
    expect(stats.delta).toBe(-3_900);
    expect(stats.pct).toBe(57);
    expect(stats.writtenChapters).toBe(2);

    const overrun = manuscriptStats({
      chapters: [{ number: 1, words: 9_000 }],
      targetChapters: 1,
      targetWordsPerChapter: 3_000,
    });
    expect(overrun.pct).toBe(100);
  });

  it("widens the plan when the book grew past its planned chapter count", () => {
    const stats = manuscriptStats({
      chapters: [
        { number: 1, words: 3_000 },
        { number: 2, words: 3_000 },
        { number: 3, words: 3_000 },
      ],
      targetChapters: 2,
      targetWordsPerChapter: 3_000,
    });

    expect(stats.totalChapters).toBe(3);
    expect(stats.targetWords).toBe(9_000);
    expect(stats.pct).toBe(100);
  });

  it("counts chapter pages per chapter, then adds the book's matter pages", () => {
    const bare = manuscriptStats(input);
    // 2,000 → 8 pages, 3,100 → 12 pages, an unwritten chapter → none.
    expect(bare.chapterPages).toBe(20);
    expect(bare.matterPages).toBe(0);
    expect(bare.pages).toBe(20);

    const matter = readBookMatter({
      dedication: "For the night readers",
      copyrightHolder: "A. Writer",
      afterword: "Looking back.",
    });
    const bound = manuscriptStats({ ...input, matter });

    expect(bound.matterPages).toBe(bookMatterPageCount(matter));
    expect(bound.pages).toBe(bare.chapterPages + bound.matterPages);
  });

  it("survives an empty project without dividing by zero", () => {
    const stats = manuscriptStats({
      chapters: [],
      targetChapters: 0,
      targetWordsPerChapter: 0,
    });

    expect(stats).toMatchObject({
      words: 0,
      targetWords: 0,
      pct: 0,
      pages: 0,
      readingMinutes: 0,
      writtenChapters: 0,
      totalChapters: 0,
    });
  });
});

describe("book reading order", () => {
  it("lists the exporters' order front to back, including the empty slots", () => {
    const order = bookReadingOrder({}, 0);

    expect(order.map((slot) => slot.key)).toEqual([
      "cover",
      "title",
      "copyright",
      "dedication",
      "epigraph",
      "foreword",
      "preface",
      "introduction",
      "contents",
      "chapters",
      "afterword",
      "authorNote",
      "acknowledgments",
      "aboutAuthor",
    ]);
    // Only the title page is printed for an author who has filled nothing in.
    expect(order.filter((slot) => slot.present).map((slot) => slot.key)).toEqual(["title"]);
  });

  it("marks the pages the author has actually supplied", () => {
    const matter = readBookMatter({
      coverUrl: "https://assets.example.test/cover.png",
      isbn: "978-0-00-000000-0",
      epigraphText: "Whatever the sea takes, it returns.",
      preface: "How this book came to be.",
      aboutAuthor: "A brief biography.",
    });

    const present = bookReadingOrder(matter, 12)
      .filter((slot) => slot.present)
      .map((slot) => slot.key);

    expect(present).toEqual([
      "cover",
      "title",
      "copyright",
      "epigraph",
      "preface",
      "contents",
      "chapters",
      "aboutAuthor",
    ]);
  });

  it("counts one prepared slot for every page bookMatterPageCount charges for", () => {
    const matter = readBookMatter({
      publisher: "Nightjar Press",
      dedication: "For the night readers",
      foreword: "A friend's opening.",
      acknowledgments: "Thank you.",
    });

    // The matter page count excludes the cover, the generated contents list and
    // the chapters, so the preview and the page estimate agree on what a
    // single prepared "page" is.
    const notMatter = new Set(["cover", "contents", "chapters"]);
    const preparedMatterSlots = bookReadingOrder(matter, 9).filter(
      (slot) => slot.present && !notMatter.has(slot.key),
    );

    expect(preparedMatterSlots.length).toBe(bookMatterPageCount(matter));
  });

  it("labels a single-chapter book without a stray plural", () => {
    expect(bookReadingOrder({}, 1).find((slot) => slot.key === "chapters")?.label).toBe(
      "1 chapter",
    );
    expect(bookReadingOrder({}, 4).find((slot) => slot.key === "chapters")?.label).toBe(
      "4 chapters",
    );
  });

  it("explains where an edition differs instead of promising every page", () => {
    const order = bookReadingOrder({}, 3);
    const notes = Object.fromEntries(order.map((slot) => [slot.key, slot.note]));

    expect(notes.cover).toMatch(/PDF and EPUB/);
    expect(notes.contents).toMatch(/PDF opens straight into chapter one/);
    // No exporter emits a half title, so the preview must not invent one.
    expect(order.some((slot) => /half[- ]title/i.test(slot.label))).toBe(false);
  });
});

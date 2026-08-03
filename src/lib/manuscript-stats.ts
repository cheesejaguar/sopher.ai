import {
  bookMatterPageCount,
  closingBookMatter,
  openingBookMatter,
  type BookMatter,
  type BookMatterSection,
} from "@/lib/book-package";
import { formatWordCount } from "@/lib/editor/chapter-status";

/**
 * Word, page and reading-time math for the manuscript surfaces, plus the
 * front-to-back page order those pages are counted over.
 *
 * The order lives beside the math on purpose: a book's page estimate is its
 * matter pages plus its chapter pages, so a preview that disagreed with the
 * count would be two truths. Everything here is pure, so the editor, the
 * reading view and book setup can render identical numbers with no extra query.
 */

/**
 * Paperback words per printed page.
 *
 * Copied from the wizard's projection constant — `WORDS_PER_PAGE` in
 * `src/components/wizard/wizard-state.ts` — rather than imported, so a lib
 * module never drags the wizard's genre catalog into the editor bundle.
 * `manuscript-stats.test.ts` asserts the two values stay equal, so an author's
 * "about 320 pages" estimate at purchase matches the one in the studio.
 */
export const WORDS_PER_PAGE = 275;

/**
 * Silent reading speed used for every "min read" in the product.
 *
 * Brysbaert's 2019 meta-analysis of English silent reading puts non-fiction at
 * ~238 wpm and fiction at ~260 wpm. 230 sits just under that range, so the
 * estimate errs toward "this will take a little longer" rather than promising a
 * faster read than the author's prose delivers. It is also the number the
 * editor status bar has always shown, so no reading time shifts under anyone.
 */
export const READING_WPM = 230;

/**
 * How far a chapter may drift from its target before the editor calls it long
 * or short. A 3,000-word target with a 2,800-word chapter is a normal draft,
 * not a problem; ±10% is wide enough to stay quiet during ordinary writing and
 * tight enough that a half-length chapter is still called out.
 */
export const CHAPTER_PACE_TOLERANCE = 0.1;

export type ChapterPace = "empty" | "under" | "on_target" | "over";

export type ChapterWordStat = {
  number: number;
  title: string | null;
  words: number;
  targetWords: number;
  /** Actual minus target: negative is short, positive is long. */
  delta: number;
  pace: ChapterPace;
  pages: number;
  readingMinutes: number;
};

export type ManuscriptStats = {
  chapters: ChapterWordStat[];
  /** Chapters with any prose saved. */
  writtenChapters: number;
  /** Chapters the finished book is planned to have. */
  totalChapters: number;
  words: number;
  targetWords: number;
  /** Actual minus target across the whole book. */
  delta: number;
  /** 0–100, clamped — share of the word goal that is written. */
  pct: number;
  chapterPages: number;
  /** Title page, copyright, dedication and the author's own matter pages. */
  matterPages: number;
  pages: number;
  readingMinutes: number;
};

export type ManuscriptStatsInput = {
  chapters: Array<{ number: number; title?: string | null; words: number }>;
  targetChapters: number;
  targetWordsPerChapter: number;
  /** Supply the book's matter so the page estimate counts the whole volume. */
  matter?: BookMatter;
};

/**
 * Printed pages for a body of prose.
 *
 * Every chapter opens on a fresh page in the exported book — `src/lib/export/
 * pdf.ts`, "Chapters — each opens on a fresh page with a title block" — so a
 * part-full page still counts, and a book's total is the sum of its chapter
 * pages rather than one division over the whole word count. It is a floor: the
 * print layout may add a blank verso to start a chapter on a right-hand page.
 */
export function estimatePages(words: number): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.ceil(words / WORDS_PER_PAGE));
}

/** Minutes to read `words` aloud in the head. Any prose at all reads as 1 min. */
export function estimateReadingMinutes(words: number): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.round(words / READING_WPM));
}

/** "48 min", "3 hr", "3 hr 20 min" — never a bare "180 min". */
export function formatReadingTime(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function chapterPace(words: number, targetWords: number): ChapterPace {
  if (words <= 0) return "empty";
  if (targetWords <= 0) return "on_target";
  const drift = (words - targetWords) / targetWords;
  if (drift > CHAPTER_PACE_TOLERANCE) return "over";
  if (drift < -CHAPTER_PACE_TOLERANCE) return "under";
  return "on_target";
}

export const CHAPTER_PACE_LABELS: Record<ChapterPace, string> = {
  empty: "Not written",
  under: "Short of target",
  on_target: "On target",
  over: "Over target",
};

/** Full sentence for assistive technology, where a coloured pill says nothing. */
export function describeChapterPace(stat: ChapterWordStat): string {
  if (stat.pace === "empty") return `Chapter ${stat.number} is not written yet.`;
  const target = `${formatWordCount(stat.targetWords)}-word target`;
  if (stat.pace === "on_target") {
    return `Chapter ${stat.number}: ${formatWordCount(stat.words)} words, on the ${target}.`;
  }
  const drift = Math.abs(stat.delta);
  const direction = stat.pace === "over" ? "over" : "under";
  return `Chapter ${stat.number}: ${formatWordCount(stat.words)} words, ${formatWordCount(
    drift,
  )} ${direction} the ${target}.`;
}

export function manuscriptStats(input: ManuscriptStatsInput): ManuscriptStats {
  const targetWordsPerChapter = Math.max(0, input.targetWordsPerChapter);
  const ordered = [...input.chapters].sort((a, b) => a.number - b.number);
  const chapters: ChapterWordStat[] = ordered.map((chapter) => {
    const words = Math.max(0, chapter.words);
    return {
      number: chapter.number,
      title: chapter.title?.trim() || null,
      words,
      targetWords: targetWordsPerChapter,
      delta: words - targetWordsPerChapter,
      pace: chapterPace(words, targetWordsPerChapter),
      pages: estimatePages(words),
      readingMinutes: estimateReadingMinutes(words),
    };
  });

  // A book that grew past its planned chapter count has not overshot its goal —
  // it has a bigger book. Measuring against the smaller plan would report a
  // finished manuscript as 130% complete, so the plan widens to what exists.
  const totalChapters = Math.max(0, input.targetChapters, chapters.length);
  const words = chapters.reduce((sum, chapter) => sum + chapter.words, 0);
  const targetWords = totalChapters * targetWordsPerChapter;
  const chapterPages = chapters.reduce((sum, chapter) => sum + chapter.pages, 0);
  const matterPages = input.matter ? bookMatterPageCount(input.matter) : 0;

  return {
    chapters,
    writtenChapters: chapters.filter((chapter) => chapter.words > 0).length,
    totalChapters,
    words,
    targetWords,
    delta: words - targetWords,
    pct: targetWords > 0 ? Math.min(100, Math.round((words / targetWords) * 100)) : 0,
    chapterPages,
    matterPages,
    pages: chapterPages + matterPages,
    readingMinutes: estimateReadingMinutes(words),
  };
}

// ---------------------------------------------------------------------------
// Reading order — what the assembled book looks like, front to back.
// ---------------------------------------------------------------------------

export type BookPageSlot = {
  /** Stable key for React lists and tests. */
  key: string;
  label: string;
  /** Plain language for an author who has never published a book before. */
  blurb: string;
  /** The author has supplied this page, or it is printed unconditionally. */
  present: boolean;
  /** Printed whether or not the author does anything. */
  required: boolean;
  /** Set when one edition treats the page differently from the others. */
  note?: string;
};

/**
 * Asks `book-package.ts` for its own catalog of optional pages instead of
 * keeping a second list here: a fully populated probe returns every opening and
 * closing section, in canonical order, with its canonical title. The Record
 * type turns a new section key into a compile error rather than a missing row.
 */
const SECTION_PROBE: Record<BookMatterSection["key"], string> = {
  foreword: "probe",
  preface: "probe",
  introduction: "probe",
  afterword: "probe",
  acknowledgments: "probe",
  authorNote: "probe",
  aboutAuthor: "probe",
};

const SECTION_BLURBS: Record<BookMatterSection["key"], string> = {
  foreword: "Someone else introduces the book and vouches for it. Optional.",
  preface: "Your own account of why and how the book came to be.",
  introduction: "Orients the reader to the subject or world before chapter one.",
  afterword: "A closing reflection once the story has ended.",
  authorNote: "Research, sources, or a last word in your own voice.",
  acknowledgments: "Thanks to the people who helped the book exist.",
  aboutAuthor: "A short biography on the final page of every edition.",
};

const OPENING_SLOTS = openingBookMatter(SECTION_PROBE);
const CLOSING_SLOTS = closingBookMatter(SECTION_PROBE);

/**
 * The assembled book, front to back.
 *
 * The order is the exporters' order, not a second opinion. Read off the
 * statements in `src/lib/export/pdf.ts`, in the order they run — the file moves
 * around, so these are quoted rather than cited by line:
 *
 *   "// Cover, full-bleed on its own page, when one was generated."
 *   "// Title page."
 *   `if (m.matter.copyrightHolder || m.matter.publisher || m.matter.isbn)`
 *   `if (m.matter.dedication)` / `if (m.matter.epigraphText)`
 *   `for (const section of openingBookMatter(m.matter))`
 *   "// Chapters — each opens on a fresh page with a title block."
 *   `for (const section of closingBookMatter(m.matter))`
 *
 * Contents sits between the opening matter and chapter one, from
 * `lines.push("## Contents", "")` in `src/lib/export/assemble.ts`. The opening
 * and closing sections come from the same `openingBookMatter` /
 * `closingBookMatter` the exporters call, so preview and export cannot drift.
 *
 * There is deliberately no half title: no exporter emits one, and a preview
 * that promised a page the file will not contain is worse than no preview.
 */
export function bookReadingOrder(matter: BookMatter, chapterCount: number): BookPageSlot[] {
  const hasCopyrightPage = Boolean(matter.copyrightHolder || matter.publisher || matter.isbn);
  return [
    {
      key: "cover",
      label: "Cover",
      blurb: "The first thing a reader sees, before any words.",
      present: Boolean(matter.coverUrl),
      required: false,
      note: "Printed in the PDF and EPUB editions. Markdown and Word files open at the title page.",
    },
    {
      key: "title",
      label: "Title page",
      blurb: "Title, subtitle and your name. Every edition prints one.",
      present: true,
      required: true,
    },
    {
      key: "copyright",
      label: "Copyright page",
      blurb: "Who owns the work, who published it, and the ISBN if it has one.",
      present: hasCopyrightPage,
      required: false,
    },
    {
      key: "dedication",
      label: "Dedication",
      blurb: "One short line, usually addressed to a single person.",
      present: Boolean(matter.dedication),
      required: false,
    },
    {
      key: "epigraph",
      label: "Epigraph",
      blurb: "A quotation that sets the tone before the story starts.",
      present: Boolean(matter.epigraphText),
      required: false,
    },
    ...OPENING_SLOTS.map((slot) => ({
      key: slot.key,
      label: slot.title,
      blurb: SECTION_BLURBS[slot.key],
      present: Boolean(matter[slot.key]),
      required: false,
    })),
    {
      key: "contents",
      label: "Contents",
      blurb: "The chapter list, built for you from the chapters that exist.",
      present: chapterCount > 0,
      required: true,
      note: "Built automatically in the Markdown, Word and EPUB editions. The PDF opens straight into chapter one.",
    },
    {
      key: "chapters",
      label: chapterCount === 1 ? "1 chapter" : `${chapterCount} chapters`,
      blurb: "The book itself. Each chapter opens on a fresh page.",
      present: chapterCount > 0,
      required: true,
    },
    ...CLOSING_SLOTS.map((slot) => ({
      key: slot.key,
      label: slot.title,
      blurb: SECTION_BLURBS[slot.key],
      present: Boolean(matter[slot.key]),
      required: false,
    })),
  ];
}

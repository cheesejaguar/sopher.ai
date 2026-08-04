import { bookMatterSchema, type BookMatter } from "@/lib/book-package";
import { countWords } from "@/lib/editor/anchors";

import { normalizeImportedMarkdown } from "./parse";

/**
 * Chapter detection for an imported manuscript.
 *
 * Everything here is deterministic and pure. That is the property the import
 * flow is built on: the author confirms a preview table, and the commit that
 * follows re-runs this exact function over the same bytes, so what they
 * approved is what gets written. No model call is involved in either pass.
 *
 * The heuristics are tried in priority order, most explicit first, and the
 * first one that finds a boundary wins:
 *
 *   1. ATX headings that name a chapter (`## Chapter 4 — Salt`) — what our own
 *      exporter emits, and what most Markdown manuscripts use.
 *   2. Any other ATX heading level used at least twice.
 *   3. Setext headings, which are lifted to ATX before 1 and 2 run.
 *   4. Standalone `CHAPTER NINE` lines, the plain-text and Word convention.
 *   5. Form feeds — a Word page break that survived the .docx conversion.
 *   6. Nothing: the manuscript becomes one chapter. Import never fails because
 *      a draft was formatted in a way we did not anticipate.
 *
 * Round-tripping our own export is a hard requirement, so the front and back
 * matter `manuscriptToMarkdown` writes (Contents, Copyright, Dedication,
 * Epigraph, Foreword, Acknowledgments…) is recognized as matter and kept out of
 * the chapter list — `importedBookMatter` puts the parts we can store back into
 * `books.front_matter`.
 */

/** `createProjectSchema`'s ceiling: a project cannot describe more chapters than this. */
export const MAX_IMPORT_CHAPTERS = 60;

/** Roughly twice the longest book we can produce; past this it is not a manuscript. */
export const MAX_IMPORT_WORDS = 500_000;

/**
 * Prose ahead of the first heading is usually a title page. Enough of it is an
 * untitled opening the author would notice losing, so it becomes chapter one.
 */
const PREAMBLE_PROSE_MIN_WORDS = 120;

/** A title page carries a byline, a synopsis line and an edition note — no more. */
const TITLE_PAGE_MAX_WORDS = 150;

/** "Part Two" with a paragraph under it is a divider; with a scene under it, a chapter. */
const DIVIDER_PROSE_MAX_WORDS = 25;

export type SplitStrategy =
  "chapter-heading" | "heading" | "setext-heading" | "chapter-line" | "form-feed" | "single";

export type DetectedChapter = {
  number: number;
  /** Null when the source heading was only a chapter number, or absent entirely. */
  title: string | null;
  markdown: string;
  wordCount: number;
};

/** The `books.front_matter` fields an imported section can map onto. */
export type MatterKey =
  | "dedication"
  | "epigraphText"
  | "foreword"
  | "preface"
  | "introduction"
  | "afterword"
  | "authorNote"
  | "acknowledgments"
  | "aboutAuthor";

export type DetectedMatter = {
  /** Null for sections we recognize but cannot store, such as Contents. */
  key: MatterKey | null;
  title: string;
  markdown: string;
  wordCount: number;
};

export type SplitResult = {
  /** The book title the document names, when it names one. */
  title: string | null;
  strategy: SplitStrategy;
  chapters: DetectedChapter[];
  /** Sections deliberately kept out of the chapter list. */
  matter: DetectedMatter[];
  totalWords: number;
};

// ---------------------------------------------------------------------------
// Line-level primitives
// ---------------------------------------------------------------------------

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const ATX = /^[ \t]{0,3}(#{1,6})[ \t]+(.*)$/;
const THEMATIC_BREAK = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT_H1 = /^[ \t]{0,3}={3,}[ \t]*$/;
const SETEXT_H2 = /^[ \t]{0,3}-{3,}[ \t]*$/;

function isBlank(line: string): boolean {
  return /^[ \t]*$/.test(line);
}

function trimHorizontal(line: string): string {
  return line.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

/** `**Chapter One**` and `_Chapter One_` are the same boundary as `Chapter One`. */
function stripEmphasis(text: string): string {
  return text
    .replace(/^[*_]{1,3}/, "")
    .replace(/[*_]{1,3}$/, "")
    .replace(/[ \t]+#*[ \t]*$/, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Heading classification
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const ROMAN = /^m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

/** Arabic, roman or English-word chapter numbers — all three appear in the wild. */
export function parseChapterNumber(token: string): number | null {
  const value = token.trim().toLowerCase();
  if (!value) return null;
  if (/^\d{1,4}$/.test(value)) return Number(value);

  const words = value.split(/[- ]/).filter(Boolean);
  if (words.length > 0 && words.every((word) => Object.hasOwn(NUMBER_WORDS, word))) {
    return words.reduce((sum, word) => sum + NUMBER_WORDS[word], 0);
  }

  if (value.length <= 7 && ROMAN.test(value)) {
    let total = 0;
    for (let i = 0; i < value.length; i += 1) {
      const current = ROMAN_VALUES[value[i]];
      const next = ROMAN_VALUES[value[i + 1]] ?? 0;
      total += current < next ? -current : current;
    }
    return total;
  }
  return null;
}

const CHAPTER_PREFIX = /^(?:chapter|chapitre|chap|ch)\b\.?[ \t]*(.*)$/i;
const STANDALONE_LABEL = /^(prologue|epilogue|interlude|prelude|coda|postscript)\b/i;
const DIVIDER_LABEL = /^(?:part|book|volume|section)\b[ \t]*(.+)$/i;

export type HeadingKind =
  | { kind: "chapter"; number: number | null; title: string | null }
  | { kind: "matter"; key: MatterKey | null }
  | { kind: "divider" }
  | { kind: "other" };

const MATTER_TITLES: Record<string, MatterKey | null> = {
  contents: null,
  "table of contents": null,
  copyright: null,
  "copyright page": null,
  colophon: null,
  "title page": null,
  "half title": null,
  "also by this author": null,
  "also by the author": null,
  dedication: "dedication",
  epigraph: "epigraphText",
  foreword: "foreword",
  forward: "foreword",
  preface: "preface",
  introduction: "introduction",
  afterword: "afterword",
  "author's note": "authorNote",
  "authors note": "authorNote",
  "a note from the author": "authorNote",
  "note from the author": "authorNote",
  acknowledgments: "acknowledgments",
  acknowledgements: "acknowledgments",
  "about the author": "aboutAuthor",
};

/**
 * Splits "Twenty-One — The Wreck" into its number and its title. The number
 * token is tried longest-first because "Chapter Two Weeks Later" is chapter two
 * of a book, not chapter "two weeks".
 */
function splitNumberAndTitle(rest: string): { number: number; title: string | null } | null {
  const attempts: string[][] = [];
  const twoWords = rest.match(/^([a-z]+[ \t]+[a-z]+)([\s\S]*)$/i);
  if (twoWords) attempts.push([twoWords[1], twoWords[2]]);
  const oneToken = rest.match(/^([0-9]+|[a-z]+(?:-[a-z]+)?)([\s\S]*)$/i);
  if (oneToken) attempts.push([oneToken[1], oneToken[2]]);

  for (const [token, remainder] of attempts) {
    const number = parseChapterNumber(token);
    if (number === null) continue;
    const title = remainder.replace(/^[ \t]*[.:]?[ \t]*/, "").replace(/^[—–\-|][ \t]*/, "");
    return { number, title: trimHorizontal(title) || null };
  }
  return null;
}

function matterLookupKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.:!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** What a heading means for the chapter list. The order of checks is the policy. */
export function classifyHeading(raw: string): HeadingKind {
  const text = stripEmphasis(raw);
  if (!text) return { kind: "other" };

  const chapter = text.match(CHAPTER_PREFIX);
  if (chapter) {
    const parts = splitNumberAndTitle(chapter[1]);
    if (parts) return { kind: "chapter", number: parts.number, title: parts.title };
  }

  // A prologue keeps its own name as the title: "Prologue" is what the author
  // wrote and what the reader expects to see, and it has no number to inherit.
  if (STANDALONE_LABEL.test(text)) return { kind: "chapter", number: null, title: text };

  const matter = matterLookupKey(text);
  if (Object.hasOwn(MATTER_TITLES, matter)) return { kind: "matter", key: MATTER_TITLES[matter] };

  const divider = text.match(DIVIDER_LABEL);
  if (divider && splitNumberAndTitle(divider[1]) !== null) return { kind: "divider" };

  return { kind: "other" };
}

// ---------------------------------------------------------------------------
// Structure detection
// ---------------------------------------------------------------------------

type HeadingMark = { index: number; depth: number; text: string };

/**
 * Rewrites `Title\n=====` as `# Title` so one heading walker handles both
 * spellings. Deliberately conservative: a dashed underline is also a thematic
 * break, and mistaking a scene break for a chapter title would both invent a
 * chapter and swallow the break.
 */
function liftSetextHeadings(input: string[]): { lines: string[]; setext: Set<number> } {
  const lines: string[] = [];
  const setext = new Set<number>();
  let fenced = false;

  for (let i = 0; i < input.length; i += 1) {
    const line = input[i];
    if (FENCE.test(line)) fenced = !fenced;

    const depth = !fenced && SETEXT_H1.test(line) ? 1 : !fenced && SETEXT_H2.test(line) ? 2 : 0;
    const previous = lines.length > 0 ? lines[lines.length - 1] : null;
    const candidate = previous === null ? "" : trimHorizontal(previous);
    // The candidate has to be a paragraph of its own. Measured against the
    // emitted lines rather than the input, since a lifted heading two lines
    // back has already had its underline removed.
    const before = lines.length >= 2 ? lines[lines.length - 2] : null;
    const standalone = before === null || isBlank(before) || ATX.test(before);
    const headingLike =
      candidate.length > 0 &&
      candidate.length <= 120 &&
      countWords(candidate) <= 12 &&
      !ATX.test(previous ?? "") &&
      !THEMATIC_BREAK.test(candidate) &&
      !/^[>\-*+]/.test(candidate) &&
      !/^\d+[.)]/.test(candidate) &&
      // Prose ends in punctuation; titles do not. This is what keeps a
      // one-line paragraph followed by `---` from becoming a heading.
      !/[.,;:]$/.test(candidate);

    if (depth > 0 && standalone && headingLike) {
      lines[lines.length - 1] = `${"#".repeat(depth)} ${stripEmphasis(candidate)}`;
      setext.add(lines.length - 1);
      continue;
    }
    lines.push(line);
  }
  return { lines, setext };
}

function atxHeadings(lines: string[]): HeadingMark[] {
  const marks: HeadingMark[] = [];
  let fenced = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (FENCE.test(lines[index])) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = lines[index].match(ATX);
    if (match) marks.push({ index, depth: match[1].length, text: stripEmphasis(match[2]) });
  }
  return marks;
}

/**
 * Standalone `CHAPTER NINE` lines. Only used when no headings exist at all, and
 * guarded tightly: a paragraph opening with "Chapter 3 was the year that…"
 * must not become a chapter boundary.
 */
function chapterLines(lines: string[]): HeadingMark[] {
  const marks: HeadingMark[] = [];
  let fenced = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || isBlank(line)) continue;
    if (index > 0 && !isBlank(lines[index - 1])) continue;
    if (index + 1 < lines.length && !isBlank(lines[index + 1])) continue;

    const text = stripEmphasis(trimHorizontal(line));
    if (text.length > 100 || countWords(text) > 12 || /[.,;:]$/.test(text)) continue;
    if (classifyHeading(text).kind === "chapter") {
      marks.push({ index, depth: 0, text });
    }
  }
  return marks;
}

type Section = { heading: string | null; depth: number; body: string };

function cutAtMarks(lines: string[], marks: HeadingMark[]): Section[] {
  const sections: Section[] = [];
  if (marks[0].index > 0) {
    sections.push({ heading: null, depth: 0, body: lines.slice(0, marks[0].index).join("\n") });
  }
  marks.forEach((mark, position) => {
    const end = position + 1 < marks.length ? marks[position + 1].index : lines.length;
    sections.push({
      heading: mark.text,
      depth: mark.depth,
      body: lines.slice(mark.index + 1, end).join("\n"),
    });
  });
  return sections;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Drops the separators and blank runs that sit between sections in our export. */
function cleanBody(body: string): string {
  const lines = body.replace(/\f/g, "").split("\n");
  let start = 0;
  let end = lines.length;
  const skippable = (line: string) => isBlank(line) || THEMATIC_BREAK.test(trimHorizontal(line));
  while (start < end && skippable(lines[start])) start += 1;
  while (end > start && skippable(lines[end - 1])) end -= 1;
  return lines
    .slice(start, end)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Pulls a leading `# Title` out of a body that was never cut at headings. */
function liftLeadingTitle(body: string): { title: string | null; body: string } {
  const lines = body.split("\n");
  const first = lines.findIndex((line) => !isBlank(line));
  if (first < 0) return { title: null, body };
  const match = lines[first].match(ATX);
  if (!match || match[1].length > 1) return { title: null, body };
  const text = stripEmphasis(match[2]);
  if (!text || classifyHeading(text).kind === "chapter") return { title: null, body };
  return { title: text, body: lines.slice(first + 1).join("\n") };
}

function buildChapters(
  sections: Section[],
  /**
   * Depth at which chapters start, when the document names its chapters. A
   * shallower heading above the first of them is the title page. Zero when the
   * chapters are just "the headings in this file", because then the first
   * heading is the first chapter and nothing above it is a title page.
   */
  chapterDepth: number,
): {
  title: string | null;
  chapters: Array<{ title: string | null; markdown: string }>;
  matter: DetectedMatter[];
} {
  let title: string | null = null;
  const chapters: Array<{ title: string | null; markdown: string; sourceNumber: number | null }> =
    [];
  const matter: DetectedMatter[] = [];

  for (const section of sections) {
    const markdown = cleanBody(section.body);
    const words = countWords(markdown);

    if (section.heading === null) {
      const lifted = liftLeadingTitle(markdown);
      if (lifted.title && !title) title = lifted.title;
      const body = cleanBody(lifted.body);
      // Real prose before the first heading is an untitled opening, not a
      // title page — keeping it costs nothing and losing it is unforgivable.
      if (countWords(body) >= PREAMBLE_PROSE_MIN_WORDS) {
        chapters.push({ title: null, markdown: body, sourceNumber: null });
      }
      continue;
    }

    const classified = classifyHeading(section.heading);
    switch (classified.kind) {
      case "chapter":
        if (words > 0) {
          chapters.push({
            title: classified.title,
            markdown,
            sourceNumber: classified.number,
          });
        }
        continue;
      case "matter":
        if (words > 0) {
          matter.push({ key: classified.key, title: section.heading, markdown, wordCount: words });
        }
        continue;
      case "divider":
        // A part divider with a scene under it is really a chapter; one with a
        // sentence of framing under it is a divider, and the sentence goes with
        // it rather than glued onto the previous chapter's last line.
        if (words > DIVIDER_PROSE_MAX_WORDS) {
          chapters.push({ title: section.heading, markdown, sourceNumber: null });
        }
        continue;
      default:
        // A heading above the chapter level, with no more text under it than a
        // title page carries, is the book's title rather than its first chapter.
        if (
          chapters.length === 0 &&
          section.depth < chapterDepth &&
          words <= TITLE_PAGE_MAX_WORDS &&
          sections.length > 1
        ) {
          if (!title) title = section.heading;
          continue;
        }
        if (words > 0) chapters.push({ title: section.heading, markdown, sourceNumber: null });
        else if (!title && section.depth <= 1) title = section.heading;
    }
  }

  return {
    title,
    chapters: chapters.map((chapter, index) => ({
      markdown: chapter.markdown,
      // Chapters are renumbered from one so the manuscript is contiguous. When
      // that disagrees with the source's own numbering, the original heading
      // survives as the title rather than being silently renumbered away.
      title:
        chapter.title ??
        (chapter.sourceNumber !== null && chapter.sourceNumber !== index + 1
          ? `Chapter ${chapter.sourceNumber}`
          : null),
    })),
    matter,
  };
}

/**
 * Splits a Markdown manuscript into chapters. Never throws and never returns
 * zero chapters for a document with words in it.
 */
export function splitManuscript(source: string): SplitResult {
  const normalized = normalizeImportedMarkdown(source);
  if (countWords(normalized) === 0) {
    return { title: null, strategy: "single", chapters: [], matter: [], totalWords: 0 };
  }

  const { lines, setext } = liftSetextHeadings(normalized.split("\n"));
  const headings = atxHeadings(lines);
  const chapterHeadings = headings.filter((mark) => classifyHeading(mark.text).kind === "chapter");

  let marks: HeadingMark[] = [];
  let strategy: SplitStrategy = "single";
  let chapterDepth = 0;

  if (chapterHeadings.length > 0) {
    const depth = Math.min(...chapterHeadings.map((mark) => mark.depth));
    marks = headings.filter((mark) => mark.depth <= depth);
    strategy = "chapter-heading";
    chapterDepth = depth;
  } else {
    const structural = headings.filter((mark) => classifyHeading(mark.text).kind !== "matter");
    const depth = [1, 2, 3, 4, 5, 6].find(
      (level) => structural.filter((mark) => mark.depth === level).length >= 2,
    );
    if (depth) {
      marks = headings.filter((mark) => mark.depth <= depth);
      strategy = "heading";
    }
  }

  if (marks.length > 0 && marks.every((mark) => setext.has(mark.index))) {
    strategy = "setext-heading";
  }

  if (marks.length === 0) {
    const plain = chapterLines(lines);
    if (plain.length > 0) {
      marks = plain;
      strategy = "chapter-line";
    }
  }

  let sections: Section[];
  if (marks.length > 0) {
    sections = cutAtMarks(lines, marks);
  } else {
    const document = lines.join("\n");
    const pages = document.split("\f").map(cleanBody);
    if (pages.filter((page) => countWords(page) > 0).length > 1) {
      // A page break is an explicit author signal, so every page is kept —
      // including short ones the heading-less preamble rule would discard.
      const lifted = liftLeadingTitle(pages[0]);
      const chapters = [cleanBody(lifted.body), ...pages.slice(1)]
        .filter((page) => countWords(page) > 0)
        .map((markdown) => ({ title: null, markdown }));
      return finalize({ title: lifted.title, chapters, matter: [] }, "form-feed");
    }
    sections = [{ heading: null, depth: 0, body: document }];
  }

  const built = buildChapters(sections, chapterDepth);
  if (built.chapters.length > 0) return finalize(built, strategy);

  // Nothing survived detection — a short document, or one that is entirely
  // front matter. One chapter holding everything beats an empty import, and the
  // matter list is cleared so no text is reported twice.
  const lifted = liftLeadingTitle(lines.join("\n"));
  const markdown = cleanBody(lifted.body);
  return finalize(
    {
      title: built.title ?? lifted.title,
      chapters: countWords(markdown) > 0 ? [{ title: null, markdown }] : [],
      matter: [],
    },
    "single",
  );
}

function finalize(
  built: {
    title: string | null;
    chapters: Array<{ title: string | null; markdown: string }>;
    matter: DetectedMatter[];
  },
  strategy: SplitStrategy,
): SplitResult {
  const chapters = built.chapters.map((chapter, index) => ({
    number: index + 1,
    title: chapter.title,
    markdown: chapter.markdown,
    wordCount: countWords(chapter.markdown),
  }));
  return {
    title: built.title,
    strategy,
    chapters,
    matter: built.matter,
    totalWords: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
  };
}

// ---------------------------------------------------------------------------
// Front matter
// ---------------------------------------------------------------------------

/** `*A dedication*` — our exporter's italics are formatting, not the text. */
function unwrapDedication(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => stripEmphasis(trimHorizontal(line)))
    .join("\n")
    .trim();
}

function unwrapEpigraph(markdown: string): { text: string; attribution?: string } {
  const lines = markdown
    .split("\n")
    .map((line) => trimHorizontal(line).replace(/^>[ \t]?/, ""))
    .filter((line, index, all) => line.length > 0 || (index > 0 && index < all.length - 1));
  const last = lines[lines.length - 1] ?? "";
  const attribution = last.match(/^[—–-][ \t]*(.+)$/);
  if (attribution) {
    return {
      text: lines.slice(0, -1).join("\n").trim(),
      attribution: attribution[1].trim(),
    };
  }
  return { text: lines.join("\n").trim() };
}

/**
 * Recognized matter sections become `books.front_matter`, which is what makes a
 * sopher.ai export re-importable without losing the pages around the chapters.
 * Values are clamped to the stored schema's limits and validated, so a hostile
 * or malformed document cannot write a shape the book editor cannot read.
 */
export function importedBookMatter(matter: DetectedMatter[]): BookMatter {
  const draft: Record<string, string> = {};
  for (const section of matter) {
    if (!section.key) continue;
    if (section.key === "dedication") {
      draft.dedication = unwrapDedication(section.markdown).slice(0, 2_000);
      continue;
    }
    if (section.key === "epigraphText") {
      const epigraph = unwrapEpigraph(section.markdown);
      draft.epigraphText = epigraph.text.slice(0, 2_000);
      if (epigraph.attribution) draft.epigraphAttribution = epigraph.attribution.slice(0, 300);
      continue;
    }
    draft[section.key] = section.markdown.slice(0, 20_000);
  }
  const parsed = bookMatterSchema.safeParse(draft);
  return parsed.success ? parsed.data : {};
}

import type { BookMatter } from "@/lib/book-package";
import {
  buildManuscript,
  type AssembledManuscript,
  type ManuscriptSourceChapter,
} from "./assemble";
import type { FigureMap } from "./figures";
import { filenameStem } from "./types";

/**
 * Single-chapter exports. The whole-book pipeline already knows how to turn an
 * `AssembledManuscript` into every format, so a chapter download only needs a
 * manuscript that contains one chapter — the renderers stay untouched.
 */

/**
 * Builds the one-chapter manuscript. A chapter is an excerpt, not an edition:
 * the byline survives so attribution travels with the file, but the copyright
 * page, dedication, cover and closing matter stay behind. Those describe the
 * finished book, and stamping them on a single chapter would misrepresent what
 * the reader has been handed. The edition note says exactly what this is.
 */
export function buildChapterManuscript(input: {
  bookTitle: string;
  genre?: string | null;
  matter?: BookMatter;
  chapter: ManuscriptSourceChapter;
  figures?: FigureMap;
}): AssembledManuscript {
  const bookTitle = input.bookTitle.trim() || "Untitled book";
  const author = input.matter?.author?.trim();
  return buildManuscript({
    title: input.chapter.title?.trim() || `Chapter ${input.chapter.number}`,
    genre: input.genre,
    matter: author ? { author } : {},
    editionNote: `Chapter ${input.chapter.number} of ${bookTitle}`,
    chapters: [input.chapter],
    figures: input.figures,
  });
}

/**
 * `the-salt-road-chapter-4`. Built from the book title rather than the chapter
 * title so a folder of downloads groups by book and sorts by chapter, and
 * reduced by `filenameStem` to `[a-z0-9-]` — which is also what makes it safe
 * to drop straight into a quoted Content-Disposition header.
 */
export function chapterFilenameStem(bookTitle: string, chapterNumber: number): string {
  const number = Number.isFinite(chapterNumber) ? Math.max(0, Math.trunc(chapterNumber)) : 0;
  return `${filenameStem(bookTitle)}-chapter-${number}`;
}

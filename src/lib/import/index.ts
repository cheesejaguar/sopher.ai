/**
 * Manuscript import: an author's existing draft (.docx, .md, .txt) becomes a
 * project, a book and a set of chapters. Free, deterministic, and no model call
 * anywhere in it — the value is entirely in reading the file honestly.
 *
 * The two halves are `parse` (any format → Markdown) and `split` (Markdown →
 * chapters). `POST /api/projects/import` is the only caller; it runs the same
 * pipeline twice, once to show the author a preview and once to commit, which
 * is safe precisely because nothing here is stochastic.
 *
 * Client components must import from here with `import type` only: the parser
 * pulls in the HTML sanitizer, which is server-side.
 */

export {
  decodeImportedText,
  detectImportFormat,
  htmlToMarkdown,
  normalizeImportedMarkdown,
  plainTextToMarkdown,
  textToMarkdown,
  IMPORT_FORMATS,
  type ImportFormat,
} from "./parse";

export {
  classifyHeading,
  importedBookMatter,
  parseChapterNumber,
  splitManuscript,
  MAX_IMPORT_CHAPTERS,
  MAX_IMPORT_WORDS,
  type DetectedChapter,
  type DetectedMatter,
  type MatterKey,
  type SplitResult,
  type SplitStrategy,
} from "./split";

/** Largest upload we accept. Vercel caps a function's request body at 4.5 MB. */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

/** One row of the table the author confirms before anything is written. */
export type ImportChapterPreview = {
  number: number;
  title: string | null;
  wordCount: number;
};

/** `POST /api/projects/import` with `mode=preview`. */
export type ImportPreviewResponse = {
  mode: "preview";
  title: string;
  strategy: string;
  chapters: ImportChapterPreview[];
  /** Sections recognized as front or back matter and kept out of the chapters. */
  skipped: string[];
  totalWords: number;
};

/** `POST /api/projects/import` with `mode=commit`. */
export type ImportCommitResponse = {
  mode: "commit";
  projectId: string;
  bookId: string;
  chapters: number;
  totalWords: number;
  /** True when this request replayed an import that had already been written. */
  replayed: boolean;
};

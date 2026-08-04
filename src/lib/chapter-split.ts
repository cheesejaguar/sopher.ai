/**
 * Text mechanics for cutting one chapter in two and for folding a chapter into
 * the one before it. Pure on purpose: the seam rules are the part an author
 * notices, so they are testable without a database or a running editor.
 *
 * Every offset here indexes the chapter's stored markdown, which is also what
 * the editor round-trips, so a cursor position and a menu choice mean the same
 * thing.
 */

/**
 * Largest chapter `saveChapter` will accept.
 *
 * Import must respect it too: a chapter written past this ceiling opens in the
 * editor and can never be saved again, which is a read-only book with no way
 * to fix it in product.
 */
export const MAX_CHAPTER_CONTENT_CHARS = 400_000;

export type ChapterSplitHalves = { before: string; after: string };

/** A cut the author can pick from a menu, with the prose that would follow it. */
export type ChapterSplitPoint = { offset: number; preview: string };

const PREVIEW_CHARS = 140;

/** Blank line(s) between blocks — the natural place a chapter comes apart. */
const PARAGRAPH_BREAK = /\n[ \t]*(?:\n[ \t]*)+/g;

/**
 * Cuts at `offset`, dropping only the whitespace at the seam. Returns null when
 * either half would be blank: a cut that empties one side is a rename or a
 * no-op, never something worth spending a chapter slot on.
 */
export function splitChapterContent(content: string, offset: number): ChapterSplitHalves | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > content.length) return null;
  const before = content.slice(0, offset).trim();
  const after = content.slice(offset).trim();
  if (!before || !after) return null;
  return { before, after };
}

function previewOf(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= PREVIEW_CHARS) return collapsed;
  return `${collapsed.slice(0, PREVIEW_CHARS).trimEnd()}…`;
}

/**
 * Every paragraph start that yields two real chapters, in document order. The
 * first block is never offered because splitting before it would leave the
 * original chapter empty. `limit` caps how many reach the client; a very long
 * chapter has more paragraph breaks than anyone will scroll through.
 */
export function chapterSplitPoints(content: string, limit = 200): ChapterSplitPoint[] {
  const points: ChapterSplitPoint[] = [];
  for (const match of content.matchAll(PARAGRAPH_BREAK)) {
    const offset = (match.index ?? 0) + match[0].length;
    const halves = splitChapterContent(content, offset);
    if (!halves) continue;
    points.push({ offset, preview: previewOf(halves.after) });
    if (points.length >= limit) break;
  }
  return points;
}

/**
 * Joins two chapters into one document. A custom title on the absorbed chapter
 * becomes a heading rather than disappearing — the author named that stretch of
 * story, and a merge should not quietly throw the name away.
 */
export function mergeChapterContent(
  first: string,
  second: string,
  secondTitle?: string | null,
): string {
  const head = first.trim();
  const tail = second.trim();
  // A heading with nothing under it is worse than no heading at all.
  const heading = tail ? secondTitle?.trim() : undefined;
  return [head, heading ? `## ${heading}` : "", tail].filter(Boolean).join("\n\n");
}

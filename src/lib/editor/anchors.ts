/**
 * Pure text utilities shared by the suggestion routes, the save action, and
 * the editor client: anchor resolution against chapter markdown, word
 * counting, and context-window extraction for selection edits.
 */

export type AnchorRange = { start: number; end: number };

/**
 * Resolve an anchor quote inside chapter content. With `hintStart`, the
 * occurrence whose start is closest to the hint wins (so duplicate passages
 * resolve to the intended one); without it, the first occurrence.
 */
export function resolveAnchor(
  content: string,
  anchorText: string,
  hintStart?: number,
): AnchorRange | null {
  if (!anchorText) return null;
  const first = content.indexOf(anchorText);
  if (first === -1) return null;
  let best = first;
  if (hintStart !== undefined) {
    for (let idx = first; idx !== -1; idx = content.indexOf(anchorText, idx + 1)) {
      if (Math.abs(idx - hintStart) < Math.abs(best - hintStart)) best = idx;
    }
  }
  return { start: best, end: best + anchorText.length };
}

/** Word count matching the drafting pipeline's convention. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * The passage before and after a selection, capped at `wordRadius` words per
 * side. `before` is always a suffix of the text preceding the selection and
 * `after` a prefix of the text following it, so `before + selection + after`
 * reproduces a contiguous slice of `content` (modulo edge whitespace).
 */
export function contextWindow(
  content: string,
  start: number,
  end: number,
  wordRadius = 500,
): { before: string; after: string } {
  // Words with their trailing whitespace: joining a *suffix* slice stays contiguous.
  const beforeChunks = content.slice(0, start).match(/\S+\s*/g) ?? [];
  // Words with their leading whitespace: joining a *prefix* slice stays contiguous.
  const afterChunks = content.slice(end).match(/\s*\S+/g) ?? [];
  return {
    before: beforeChunks.slice(-wordRadius).join(""),
    after: afterChunks.slice(0, wordRadius).join(""),
  };
}

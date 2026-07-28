import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Plain-text indexing of a ProseMirror doc: builds the concatenated text of
 * all text nodes (blocks separated by "\n\n") plus a map from text offsets
 * back to ProseMirror positions. Used to locate suggestion anchors (verbatim
 * quotes from the chapter markdown) inside the live document.
 */

type Segment = { textStart: number; textEnd: number; pmStart: number };

export type DocTextIndex = {
  text: string;
  /** Map a [start, end) range in `text` to PM positions. Null when the range only covers separators. */
  toPmRange(start: number, end: number): { from: number; to: number } | null;
};

const BLOCK_SEPARATOR = "\n\n";

export function indexDocText(doc: PMNode): DocTextIndex {
  const segments: Segment[] = [];
  let text = "";

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      segments.push({
        textStart: text.length,
        textEnd: text.length + node.text.length,
        pmStart: pos,
      });
      text += node.text;
      return true;
    }
    if (node.isBlock && text.length > 0 && !text.endsWith(BLOCK_SEPARATOR)) {
      text += BLOCK_SEPARATOR;
    }
    return true;
  });

  function positionAt(offset: number, snapForward: boolean): number | null {
    for (const seg of segments) {
      if (offset >= seg.textStart && offset <= seg.textEnd) {
        return seg.pmStart + (offset - seg.textStart);
      }
    }
    if (snapForward) {
      const next = segments.find((s) => s.textStart >= offset);
      return next ? next.pmStart : null;
    }
    const prev = [...segments].reverse().find((s) => s.textEnd <= offset);
    return prev ? seg2end(prev) : null;
  }

  function seg2end(seg: Segment): number {
    return seg.pmStart + (seg.textEnd - seg.textStart);
  }

  return {
    text,
    toPmRange(start, end) {
      if (end <= start) return null;
      const from = positionAt(start, true);
      const to = positionAt(end, false);
      if (from == null || to == null || to <= from) return null;
      return { from, to };
    },
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Anchors longer than this skip the whitespace-tolerant regex pass. */
const MAX_FUZZY_ANCHOR = 600;

/**
 * Find `needle` in `haystack`, exact first, then tolerating differing
 * whitespace runs (markdown "\n\n" vs doc-text separators, wrapped lines).
 */
export function findTextRange(
  haystack: string,
  needle: string,
): { start: number; end: number } | null {
  if (!needle) return null;
  const exact = haystack.indexOf(needle);
  if (exact !== -1) return { start: exact, end: exact + needle.length };

  if (needle.length > MAX_FUZZY_ANCHOR) return null;
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const pattern = tokens.map(escapeRegExp).join("\\s+");
  const match = new RegExp(pattern).exec(haystack);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length };
}

/**
 * Locate a suggestion anchor inside the live doc. Returns PM positions, or
 * null when the quoted text no longer appears (the suggestion is then shown
 * as "unanchored" in the review panel only).
 */
export function findAnchorRangeInDoc(
  doc: PMNode,
  originalText: string,
): { from: number; to: number } | null {
  const index = indexDocText(doc);
  const range = findTextRange(index.text, originalText);
  if (!range) return null;
  return index.toPmRange(range.start, range.end);
}

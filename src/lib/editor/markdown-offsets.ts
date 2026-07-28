import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

/**
 * Maps a ProseMirror selection to offsets in the serialized markdown.
 *
 * Approach (the "exact" option from the two allowed): insert private-use
 * sentinel characters at the selection boundaries on a throwaway transaction
 * (never dispatched), serialize the sentinel doc with the same tiptap-markdown
 * serializer used for saving, and read the sentinel offsets out of the
 * serialized string. A final verification against the clean serialization
 * guards the rare escaping edge cases (e.g. a sentinel splitting an emphasis
 * marker); on mismatch we return null and the caller shows a designed
 * "reselect" hint instead of sending wrong offsets.
 */

const SENTINEL_START = "\uE000";
const SENTINEL_END = "\uE001";

export type MarkdownSelection = { start: number; end: number; text: string };

export type MarkdownDocSerializer = (doc: PMNode) => string;

export function markdownSelection(
  state: EditorState,
  serialize: MarkdownDocSerializer,
  from: number,
  to: number,
): MarkdownSelection | null {
  if (to <= from) return null;

  // Insert the end sentinel first so `from` keeps its meaning.
  const tr = state.tr;
  tr.insertText(SENTINEL_END, to);
  tr.insertText(SENTINEL_START, from);

  let withSentinels: string;
  let clean: string;
  try {
    withSentinels = serialize(tr.doc);
    clean = serialize(state.doc);
  } catch {
    return null;
  }

  // A document that already contains a sentinel character makes the offsets
  // ambiguous (we'd find its sentinel, not ours) — bail so the caller shows
  // the reselect hint instead of silently truncating.
  if (clean.includes(SENTINEL_START) || clean.includes(SENTINEL_END)) return null;

  const startIdx = withSentinels.indexOf(SENTINEL_START);
  const endIdx = withSentinels.indexOf(SENTINEL_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;

  const start = startIdx;
  const end = endIdx - SENTINEL_START.length;
  const text = withSentinels.slice(startIdx + SENTINEL_START.length, endIdx);

  // The offsets are only trustworthy if the sentinel-free serialization
  // matches what the server has after a flush-save.
  if (clean.slice(start, end) !== text) return null;
  if (text.length === 0) return null;

  return { start, end, text };
}

import { isActionableReplacement } from "@/lib/editor/actionable-replacement";
import { countWords } from "@/lib/editor/anchors";

/**
 * `chapter_revisions.source` written before "Accept all" rewrites a chapter.
 * Kept out of the route module so the history panel can label it.
 */
export const APPLY_ALL_REVISION_SOURCE = "pre-apply-all";

export type ApplyAllSuggestion = {
  id: string;
  chapterId: string;
  chapterVersion: number;
  anchor: { start: number; end: number; originalText: string };
  suggestedText: string;
};

export type ApplyAllChapter = { id: string; content: string; version: number };

export type ApplyAllChapterEdit = {
  chapterId: string;
  previousContent: string;
  previousVersion: number;
  content: string;
  wordCount: number;
  suggestionIds: string[];
};

export type ApplyAllPlan =
  | { status: "ok"; edits: ApplyAllChapterEdit[]; retiredIds: string[] }
  | { status: "conflict"; chapterId: string; reason: ApplyAllConflictReason };

export type ApplyAllConflictReason = "version" | "missing" | "moved" | "overlap";

/**
 * Plan a manuscript-wide "Accept all". Pure so the all-or-nothing rules can be
 * tested without a database:
 *
 * - every suggestion must have been made against the chapter's current
 *   version and still quote its recorded offsets exactly;
 * - suggestions in one chapter must not overlap — splicing one replacement
 *   into another's range would silently corrupt the prose;
 * - suggestions whose replacement changes nothing are retired, not applied.
 *
 * Any conflict aborts the whole plan: the author approved a set of edits, and
 * applying a subset of them is a different manuscript than the one reviewed.
 */
export function planApplyAll(
  chapters: readonly ApplyAllChapter[],
  pending: readonly ApplyAllSuggestion[],
): ApplyAllPlan {
  const byChapter = new Map<string, ApplyAllSuggestion[]>();
  const retiredIds: string[] = [];
  for (const suggestion of pending) {
    if (!isActionableReplacement(suggestion.anchor.originalText, suggestion.suggestedText)) {
      retiredIds.push(suggestion.id);
      continue;
    }
    const list = byChapter.get(suggestion.chapterId) ?? [];
    list.push(suggestion);
    byChapter.set(suggestion.chapterId, list);
  }

  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const edits: ApplyAllChapterEdit[] = [];
  for (const [chapterId, suggestions] of byChapter) {
    const chapter = chapterById.get(chapterId);
    if (!chapter) return { status: "conflict", chapterId, reason: "missing" };
    if (suggestions.some((s) => s.chapterVersion !== chapter.version)) {
      return { status: "conflict", chapterId, reason: "version" };
    }

    // Descending by start, so each splice leaves every earlier offset intact.
    const ordered = [...suggestions].sort((a, b) => b.anchor.start - a.anchor.start);
    let content = chapter.content;
    let previousStart = Number.POSITIVE_INFINITY;
    for (const suggestion of ordered) {
      const { start, end, originalText } = suggestion.anchor;
      if (start < 0 || end < start || chapter.content.slice(start, end) !== originalText) {
        return { status: "conflict", chapterId, reason: "moved" };
      }
      if (end > previousStart) {
        return { status: "conflict", chapterId, reason: "overlap" };
      }
      content = content.slice(0, start) + suggestion.suggestedText + content.slice(end);
      previousStart = start;
    }

    edits.push({
      chapterId,
      previousContent: chapter.content,
      previousVersion: chapter.version,
      content,
      wordCount: countWords(content),
      suggestionIds: ordered.map((s) => s.id),
    });
  }
  return { status: "ok", edits, retiredIds };
}

// Resume semantics for full-book runs: a retry after a failure must reuse
// finished work instead of re-billing it.

export type ResumableChapter = {
  status: "planned" | "drafting" | "drafted" | "edited" | "final";
  content: string;
  wordCount: number;
  qualityScore: string | null;
};

/**
 * A chapter survives into a new run when a prior run already produced real
 * prose for it. "drafting" rows (crashed mid-write, content empty) and
 * planned rows are regenerated.
 */
export function isChapterComplete(chapter: ResumableChapter | null | undefined): boolean {
  if (!chapter) return false;
  if (chapter.status === "planned" || chapter.status === "drafting") return false;
  return chapter.content.trim().length > 0 && chapter.wordCount > 0;
}

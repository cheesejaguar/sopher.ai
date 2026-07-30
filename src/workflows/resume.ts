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

/**
 * Finished prose is not the end of chapter production: the paid summarizer
 * also updates rolling memory, canon, relationships, and moderation. Outline
 * summaries are prefilled, so only a digest-bound durable checkpoint proves
 * that post-write upkeep finished for this exact prose.
 */
export function isChapterProductionComplete(
  chapter: ResumableChapter | null | undefined,
  checkpoint: { contentDigest: string } | null | undefined,
  currentContentDigest: string | null | undefined,
  downstreamCheckpoint?: { contentDigest: string } | null,
): boolean {
  return (
    isChapterComplete(chapter) &&
    currentContentDigest !== undefined &&
    currentContentDigest !== null &&
    (checkpoint?.contentDigest === currentContentDigest ||
      downstreamCheckpoint?.contentDigest === currentContentDigest)
  );
}

type ResettableChapter = {
  status: ResumableChapter["status"];
  content: string;
  wordCount: number;
  qualityScore: string | null;
};

/**
 * Pure reset decision used by prepareBookRunStep. If an archive insert
 * succeeded but the step stopped before clearing the chapter, a retry resets
 * it without inserting the same prose twice. Once reset, another retry is a
 * no-op.
 */
export function planFreshRunChapter(
  chapter: ResettableChapter,
  contentAlreadyArchived: boolean,
): { archive: boolean; reset: boolean } {
  const alreadyReset =
    chapter.content.length === 0 &&
    chapter.wordCount === 0 &&
    chapter.qualityScore === null &&
    chapter.status === "planned";
  if (alreadyReset) return { archive: false, reset: false };
  return {
    archive: chapter.content.length > 0 && !contentAlreadyArchived,
    reset: true,
  };
}

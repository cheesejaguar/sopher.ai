/** Below this share of the target, a draft may be working notes rather than prose. */
const DRAFT_MIN_SHARE_OF_TARGET = 0.25;

/** Shared by the writer and the finished-manuscript gate. */
export function minimumChapterWordCount(targetWords: number): number {
  return Math.ceil(targetWords * DRAFT_MIN_SHARE_OF_TARGET);
}

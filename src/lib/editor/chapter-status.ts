/** Shared chapter-status presentation constants for the editor surfaces. */

export type ChapterStatus = "planned" | "drafting" | "drafted" | "edited" | "final";

export const chapterStatusLabels: Record<ChapterStatus, string> = {
  planned: "Planned",
  drafting: "Drafting",
  drafted: "Drafted",
  edited: "Edited",
  final: "Final",
};

/** Status dot classes — primary marks author-owned progress, teal marks live AI work. */
export const chapterStatusDotClasses: Record<ChapterStatus, string> = {
  planned: "border border-border bg-transparent",
  drafting: "bg-ai motion-safe:animate-pulse",
  drafted: "bg-primary/60",
  edited: "bg-primary",
  final: "bg-success",
};

export function formatWordCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

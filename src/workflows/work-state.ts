import { createHash } from "node:crypto";

import type { GenerationConfig, GenerationWorkState } from "@/lib/run-events";

/**
 * Pruning for `generation_runs.config.work`.
 *
 * Work checkpoints exist so a retried step continues instead of re-buying a
 * provider call. Once the output they hold is durable somewhere else — the
 * chapter row plus its digest-bound completion checkpoint — the text is pure
 * duplication, and it was the bulk of a config that every step reads in full
 * and rewrites with an optimistic whole-column compare several times per
 * chapter. These helpers drop only text that is already persisted, and every
 * reader accepts both full blobs (older deployments, in-flight runs) and
 * pruned ones.
 */

export type ChapterWork = NonNullable<GenerationWorkState["chapters"]>[string];
export type EditWork = NonNullable<GenerationWorkState["edits"]>[string];

/** The digest every content checkpoint uses: sha256 hex of the UTF-8 text. */
export function contentDigest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function presentCount(values: unknown[]): number {
  return values.filter((value) => value !== undefined && value !== null).length;
}

/** Checkpoints a chapter entry represents, including any already pruned. */
export function chapterWorkCheckpointCount(entry: ChapterWork | undefined): number {
  if (!entry) return 0;
  return (
    (entry.persisted?.checkpointCount ?? 0) +
    presentCount([entry.scenePlan, entry.draft, entry.critique, entry.summary, entry.result])
  );
}

/**
 * Collapses a chapter's writer/summary checkpoints to a digest marker. Call
 * only when the chapter row holds `persistedDigest` and its post-write
 * completion checkpoint is being written in the same transaction.
 */
export function pruneChapterWork(
  entry: ChapterWork | undefined,
  persistedDigest: string,
): ChapterWork | undefined {
  if (!entry) return undefined;
  return {
    persisted: {
      contentDigest: persistedDigest,
      checkpointCount: chapterWorkCheckpointCount(entry),
    },
  };
}

/** Drops an applied edit's text, keeping a digest that still identifies it. */
export function pruneEditWork(entry: EditWork | undefined): EditWork | undefined {
  if (!entry || entry.content === undefined) return entry;
  return {
    baseContentDigest: entry.baseContentDigest,
    contentDigest: contentDigest(entry.content),
    changed: entry.changed,
    notes: entry.notes,
  };
}

/**
 * An edit checkpoint that can still be applied. A pruned change has no text
 * left to apply, so it is not reusable and the edit must be bought again —
 * which only happens if the author has since restored the pre-edit prose.
 */
export function reusableEditWork(
  entry: EditWork | undefined,
): (EditWork & { content: string }) | (EditWork & { changed: false }) | undefined {
  if (!entry) return undefined;
  if (entry.content !== undefined) return entry as EditWork & { content: string };
  return entry.changed ? undefined : (entry as EditWork & { changed: false });
}

/** True when the chapter already holds this edit's output (full or pruned entry). */
export function editOutputAlreadyApplied(
  currentContent: string,
  entry: EditWork | null | undefined,
): boolean {
  if (entry?.changed !== true) return false;
  if (entry.content !== undefined) return entry.content === currentContent;
  return entry.contentDigest !== undefined && entry.contentDigest === contentDigest(currentContent);
}

/**
 * A completed run is never a resume source (only failed/cancelled runs are),
 * so its chapter and edit work is dead weight read by every progress and
 * health poll. Everything small and provenance-bearing stays.
 */
export function dropCompletedRunWork(config: GenerationConfig): GenerationConfig {
  if (!config.work) return config;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
  const { chapters, edits, entityBible, creativeQuestion, ...rest } = config.work;
  return { ...config, work: rest };
}

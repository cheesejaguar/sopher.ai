import { createHash } from "node:crypto";

export type ManuscriptStateRow = {
  id?: string;
  chapterNumber: number;
  title: string | null;
  summary: string | null;
  content: string;
  status: string;
  wordCount: number;
};

/**
 * Fresh generation keeps surplus rows as recoverable placeholders. They are
 * intentionally outside the live manuscript and must not affect review,
 * topology, or completion checkpoints.
 */
export function isSoftRetiredChapter(row: ManuscriptStateRow): boolean {
  return (
    row.status === "planned" && row.wordCount === 0 && row.title === null && row.summary === null
  );
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export type OutlineStateRow = {
  id: string;
  version: number;
  source: string;
  content: unknown;
};

/**
 * Provenance for the author-visible outline that a generation attempt starts
 * from. Including the row identity and version means an append-only user edit
 * is a resume barrier even when it happens to serialize to similar content.
 */
export function outlineStateFingerprint(row: OutlineStateRow | null | undefined): string {
  return digestJson(
    row
      ? {
          id: row.id,
          version: row.version,
          source: row.source,
          content: row.content,
        }
      : null,
  );
}

function liveRows(rows: ManuscriptStateRow[]): ManuscriptStateRow[] {
  return rows
    .filter((row) => !isSoftRetiredChapter(row))
    .sort(
      (left, right) =>
        left.chapterNumber - right.chapterNumber || (left.id ?? "").localeCompare(right.id ?? ""),
    );
}

/**
 * Stable identity/ordering proof for number-keyed generation checkpoints.
 * Content and cosmetic metadata are deliberately excluded: prose changes
 * invalidate downstream review through manuscriptDigest, while renames do not
 * risk attaching chapter N's writer checkpoint to a different row.
 */
export function chapterTopologyFingerprint(rows: ManuscriptStateRow[]): string {
  return digestJson(
    liveRows(rows).map((row) => ({
      id: row.id ?? null,
      chapterNumber: row.chapterNumber,
    })),
  );
}

/** Exact author-visible manuscript state used to bind review/finalization. */
export function manuscriptDigest(rows: ManuscriptStateRow[]): string {
  return digestJson(
    liveRows(rows).map((row) => ({
      id: row.id ?? null,
      chapterNumber: row.chapterNumber,
      title: row.title,
      summary: row.summary,
      content: row.content,
    })),
  );
}

export function cachedEditOutputAlreadyApplied(
  currentContent: string,
  edit:
    | {
        content: string;
        changed: boolean;
      }
    | null
    | undefined,
): boolean {
  return edit?.changed === true && digestJson(edit.content) === digestJson(currentContent);
}

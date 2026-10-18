import { createHash } from "node:crypto";
import { eq, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/db";
import {
  isSoftRetiredChapter,
  manuscriptDigest,
  type ManuscriptStateRow,
} from "@/lib/manuscript-state";

import { contentDigest } from "./work-state";

/**
 * Manuscript digests computed without loading the manuscript.
 *
 * A six-phase continuity review compared the current manuscript against its
 * checkpoints about nineteen times, and each comparison loaded every chapter's
 * full text to hash it in JS. The v2 digest hashes the same identity fields
 * over a per-chapter content hash that Postgres computes, so only 64 hex
 * characters per chapter cross the wire.
 *
 * Checkpoints written before v2 hold the original digest. They carry no
 * prefix, so `manuscriptDigestMatches` recognizes them and recomputes the
 * original digest (one full load) only for those — an in-flight or resumed
 * run's checkpoints keep matching, and no paid phase is re-run because the
 * formula changed.
 */

const V2_PREFIX = "v2:";

/** Postgres sha256 of a text column, hex — identical to contentDigest() in Node. */
export function sqlContentSha256(column: AnyColumn | SQL): SQL<string> {
  return sql<string>`encode(sha256(convert_to(${column}, 'UTF8')), 'hex')`;
}

export type ManuscriptFingerprintRow = Omit<ManuscriptStateRow, "content"> & {
  contentSha256: string;
};

export function manuscriptDigestV2(rows: ManuscriptFingerprintRow[]): string {
  const live = rows
    .filter((row) => !isSoftRetiredChapter({ ...row, content: "" }))
    .sort(
      (left, right) =>
        left.chapterNumber - right.chapterNumber || (left.id ?? "").localeCompare(right.id ?? ""),
    );
  const digest = createHash("sha256")
    .update(
      JSON.stringify(
        live.map((row) => ({
          id: row.id ?? null,
          chapterNumber: row.chapterNumber,
          title: row.title,
          summary: row.summary,
          contentSha256: row.contentSha256,
        })),
      ),
    )
    .digest("hex");
  return `${V2_PREFIX}${digest}`;
}

export type CurrentManuscript = {
  /** The digest new checkpoints record. */
  digest: string;
  /** The pre-v2 digest, computed only when an old checkpoint needs it. */
  legacyDigest: () => Promise<string>;
};

/** For callers that already hold full chapter rows: both digests, no extra reads. */
export function currentManuscriptFromRows(rows: ManuscriptStateRow[]): CurrentManuscript {
  const legacy = manuscriptDigest(rows);
  return {
    digest: manuscriptDigestV2(
      rows.map(({ content, ...row }) => ({ ...row, contentSha256: contentDigest(content) })),
    ),
    legacyDigest: async () => legacy,
  };
}

export async function loadCurrentManuscript(bookId: string): Promise<CurrentManuscript> {
  const rows = await getDb()
    .select({
      id: schema.chapters.id,
      chapterNumber: schema.chapters.chapterNumber,
      title: schema.chapters.title,
      summary: schema.chapters.summary,
      status: schema.chapters.status,
      wordCount: schema.chapters.wordCount,
      contentSha256: sqlContentSha256(schema.chapters.content),
    })
    .from(schema.chapters)
    .where(eq(schema.chapters.bookId, bookId));
  let legacy: Promise<string> | undefined;
  return {
    digest: manuscriptDigestV2(rows),
    legacyDigest: () =>
      (legacy ??= getDb()
        .select({
          id: schema.chapters.id,
          chapterNumber: schema.chapters.chapterNumber,
          title: schema.chapters.title,
          summary: schema.chapters.summary,
          content: schema.chapters.content,
          status: schema.chapters.status,
          wordCount: schema.chapters.wordCount,
        })
        .from(schema.chapters)
        .where(eq(schema.chapters.bookId, bookId))
        .then(manuscriptDigest)),
  };
}

/** Short manuscript identity for billing and mutation scopes (16 hex characters). */
export function digestScopeKey(digest: string): string {
  return (digest.startsWith(V2_PREFIX) ? digest.slice(V2_PREFIX.length) : digest).slice(0, 16);
}

/** Whether a stored checkpoint digest (either version) describes the current manuscript. */
export async function manuscriptDigestMatches(
  stored: string | null | undefined,
  current: CurrentManuscript,
): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith(V2_PREFIX)) return stored === current.digest;
  return stored === (await current.legacyDigest());
}

/**
 * Archive de-dupe predicate: compares hashes in SQL instead of shipping the
 * chapter's full text as a bind parameter to compare against every archive.
 */
export function revisionContentEquals(content: string): SQL {
  return sql`${sqlContentSha256(schema.chapterRevisions.content)} = ${contentDigest(content)}`;
}

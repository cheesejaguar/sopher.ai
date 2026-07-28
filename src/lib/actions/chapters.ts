"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { getChapterOwnership } from "@/db/queries/books";
import { requireUser } from "@/lib/auth";
import { countWords } from "@/lib/editor/anchors";

export type SaveChapterResult =
  | { ok: true; version: number; wordCount: number }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "conflict"; currentVersion: number }
  | { ok: false; error: "invalid" };

/** Cheap history: snapshot every Nth version or on a large delta. */
const REVISION_EVERY_N_VERSIONS = 10;
const REVISION_CHAR_DELTA = 2000;

const MAX_CONTENT_CHARS = 400_000;

/**
 * Persist the editor's markdown with optimistic concurrency: the write only
 * lands when the stored version still equals `baseVersion` (pass
 * `force: true` for the "Keep mine" conflict resolution, which overwrites
 * whatever is current). Inserts a chapter_revisions row (source "user") every
 * 10th version or when the content shifted by more than ~2000 characters.
 */
export async function saveChapter(
  chapterId: string,
  content: string,
  baseVersion: number,
  opts?: { force?: boolean },
): Promise<SaveChapterResult> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(chapterId).success) return { ok: false, error: "not_found" };
  if (
    typeof content !== "string" ||
    content.length > MAX_CONTENT_CHARS ||
    !Number.isInteger(baseVersion)
  ) {
    return { ok: false, error: "invalid" };
  }

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) return { ok: false, error: "not_found" };

  const db = getDb();
  const [current] = await db
    .select({ content: schema.chapters.content, version: schema.chapters.version })
    .from(schema.chapters)
    .where(eq(schema.chapters.id, chapterId))
    .limit(1);
  if (!current) return { ok: false, error: "not_found" };

  if (!opts?.force && current.version !== baseVersion) {
    return { ok: false, error: "conflict", currentVersion: current.version };
  }

  const fromVersion = current.version;
  const newVersion = fromVersion + 1;
  const wordCount = countWords(content);

  const [updated] = await db
    .update(schema.chapters)
    .set({ content, wordCount, version: newVersion, updatedAt: new Date() })
    .where(and(eq(schema.chapters.id, chapterId), eq(schema.chapters.version, fromVersion)))
    .returning({ version: schema.chapters.version });

  if (!updated) {
    // Lost a race between our read and write.
    const [now] = await db
      .select({ version: schema.chapters.version })
      .from(schema.chapters)
      .where(eq(schema.chapters.id, chapterId))
      .limit(1);
    return { ok: false, error: "conflict", currentVersion: now?.version ?? fromVersion };
  }

  const bigDelta = Math.abs(content.length - current.content.length) > REVISION_CHAR_DELTA;
  if (newVersion % REVISION_EVERY_N_VERSIONS === 0 || bigDelta) {
    await db.insert(schema.chapterRevisions).values({ chapterId, content, source: "user" });
  }

  return { ok: true, version: newVersion, wordCount };
}

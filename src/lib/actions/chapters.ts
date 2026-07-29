"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { revalidatePath } from "next/cache";

import { getDb, schema } from "@/db";
import { getChapterOwnership } from "@/db/queries/books";
import { requireUser } from "@/lib/auth";
import { countWords } from "@/lib/editor/anchors";

/**
 * Structural edits renumber chapters, and an in-flight run addresses chapters
 * by number — reordering under it would desynchronize the workflow's targets.
 * Rename is exempt (titles are cosmetic to the pipeline).
 */
async function assertNoActiveRun(projectId: string): Promise<void> {
  const db = getDb();
  const [active] = await db
    .select({ id: schema.generationRuns.id })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
      ),
    )
    .limit(1);
  if (active) throw new Error("Finish or stop the current run before restructuring chapters");
}

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

/**
 * Chapter management. All of these check ownership through the same
 * getChapterOwnership/project join as saveChapter, and none touch content —
 * they are structural edits an author makes around the prose.
 */

export async function renameChapter(chapterId: string, title: string): Promise<void> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(chapterId).success) throw new Error("Chapter not found");
  const trimmed = title.trim().slice(0, 300);

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) throw new Error("Chapter not found");

  await getDb()
    .update(schema.chapters)
    // Empty title reverts to the default "Chapter N" rendering.
    .set({ title: trimmed || null, updatedAt: new Date() })
    .where(eq(schema.chapters.id, chapterId));
  revalidatePath(`/projects/${ownership.projectId}`);
}

export async function deleteChapter(chapterId: string): Promise<void> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(chapterId).success) throw new Error("Chapter not found");

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) throw new Error("Chapter not found");
  await assertNoActiveRun(ownership.projectId);

  const db = getDb();
  const [chapter] = await db
    .select({ bookId: schema.chapters.bookId, number: schema.chapters.chapterNumber })
    .from(schema.chapters)
    .where(eq(schema.chapters.id, chapterId))
    .limit(1);
  if (!chapter) throw new Error("Chapter not found");

  await db.delete(schema.chapters).where(eq(schema.chapters.id, chapterId));
  // Close the numbering gap. Two-phase renumber: the unique (bookId, number)
  // index would reject in-place decrements meeting their predecessor, so pass
  // one parks the tail at an offset no real chapter uses.
  await db.execute(sql`
    update chapters set chapter_number = chapter_number + 100000
    where book_id = ${chapter.bookId} and chapter_number > ${chapter.number}
  `);
  await db.execute(sql`
    update chapters set chapter_number = chapter_number - 100001
    where book_id = ${chapter.bookId} and chapter_number > 100000
  `);
  revalidatePath(`/projects/${ownership.projectId}`);
}

/** Inserts a blank chapter after `afterNumber` (0 = at the start). */
export async function addChapter(
  projectId: string,
  afterNumber: number,
): Promise<{ chapterNumber: number }> {
  const { userId } = await requireUser();
  const db = getDb();
  const [book] = await db
    .select({ id: schema.books.id })
    .from(schema.books)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!book) throw new Error("Book not found");
  await assertNoActiveRun(projectId);

  const insertAt = Math.max(0, Math.trunc(afterNumber)) + 1;
  // Same two-phase shift, upward this time, to open the slot.
  await db.execute(sql`
    update chapters set chapter_number = chapter_number + 100000
    where book_id = ${book.id} and chapter_number >= ${insertAt}
  `);
  await db.execute(sql`
    update chapters set chapter_number = chapter_number - 99999
    where book_id = ${book.id} and chapter_number > 100000
  `);
  await db.insert(schema.chapters).values({
    bookId: book.id,
    chapterNumber: insertAt,
    status: "drafted",
    content: "",
  });
  revalidatePath(`/projects/${projectId}`);
  return { chapterNumber: insertAt };
}

/** Moves a chapter up or down one slot by swapping numbers with its neighbour. */
export async function moveChapter(chapterId: string, direction: "up" | "down"): Promise<void> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(chapterId).success) throw new Error("Chapter not found");

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) throw new Error("Chapter not found");
  await assertNoActiveRun(ownership.projectId);

  const db = getDb();
  const [chapter] = await db
    .select({ bookId: schema.chapters.bookId, number: schema.chapters.chapterNumber })
    .from(schema.chapters)
    .where(eq(schema.chapters.id, chapterId))
    .limit(1);
  if (!chapter) throw new Error("Chapter not found");

  const targetNumber = direction === "up" ? chapter.number - 1 : chapter.number + 1;
  const [neighbour] = await db
    .select({ id: schema.chapters.id })
    .from(schema.chapters)
    .where(
      and(
        eq(schema.chapters.bookId, chapter.bookId),
        eq(schema.chapters.chapterNumber, targetNumber),
      ),
    )
    .limit(1);
  if (!neighbour) return; // already at the edge

  // Three-step swap through a parking number the unique index never sees twice.
  await db.execute(sql`
    update chapters set chapter_number = 100000 where id = ${chapterId}
  `);
  await db.execute(sql`
    update chapters set chapter_number = ${chapter.number} where id = ${neighbour.id}
  `);
  await db.execute(sql`
    update chapters set chapter_number = ${targetNumber} where id = ${chapterId}
  `);
  revalidatePath(`/projects/${ownership.projectId}`);
}

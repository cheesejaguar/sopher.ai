"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { revalidatePath } from "next/cache";

import { getDb, getSqlClient, schema } from "@/db";
import { getChapterOwnership } from "@/db/queries/books";
import { requireUser } from "@/lib/auth";
import { countWords } from "@/lib/editor/anchors";
import { generationResetMetadata, isGenerationResetSource } from "@/lib/generation-archive";
import {
  assertNoActiveAuthoringRun,
  hasActiveAuthoringRun,
  noActiveAuthoringRunSql,
} from "@/lib/generation-runs";

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

  // A generation run owns chapter writes while active. Reuse the existing
  // conflict result so open editor tabs enter their normal reload/merge path;
  // even "Keep mine" must not overwrite prose the workflow is producing.
  if (await hasActiveAuthoringRun(ownership.projectId)) {
    return { ok: false, error: "conflict", currentVersion: current.version };
  }

  if (!opts?.force && current.version !== baseVersion) {
    return { ok: false, error: "conflict", currentVersion: current.version };
  }

  const fromVersion = current.version;
  const newVersion = fromVersion + 1;
  const wordCount = countWords(content);

  const [updated] = await db
    .update(schema.chapters)
    .set({ content, wordCount, version: newVersion, updatedAt: new Date() })
    .where(
      and(
        eq(schema.chapters.id, chapterId),
        eq(schema.chapters.version, fromVersion),
        noActiveAuthoringRunSql(ownership.projectId),
      ),
    )
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
  await assertNoActiveAuthoringRun(
    ownership.projectId,
    "Finish or stop the current run before renaming chapters",
  );

  const [renamed] = await getDb()
    .update(schema.chapters)
    // Empty title reverts to the default "Chapter N" rendering.
    .set({
      title: trimmed || null,
      version: sql`${schema.chapters.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.chapters.id, chapterId), noActiveAuthoringRunSql(ownership.projectId)))
    .returning({ id: schema.chapters.id });
  if (!renamed) throw new Error("Finish or stop the current run before renaming chapters");
  revalidatePath(`/projects/${ownership.projectId}`);
}

export async function deleteChapter(chapterId: string): Promise<void> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(chapterId).success) throw new Error("Chapter not found");

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) throw new Error("Chapter not found");
  await assertNoActiveAuthoringRun(ownership.projectId);

  const [, allowed] = await getSqlClient().transaction((tx) => [
    tx`select pg_advisory_xact_lock(
      hashtextextended('sopher:project-authoring:' || ${ownership.projectId}, 0)
    )`,
    tx`
      select not exists (
        select 1 from generation_runs
        where project_id = ${ownership.projectId}
          and status in ('queued', 'running', 'awaiting_input')
          and kind <> 'export'
      ) as allowed
    `,
    // Close the numbering gap. The two parking updates and delete share this
    // transaction, so a failure cannot strand numbers at 100000.
    tx`
      update chapters
      set chapter_number = chapter_number + 100000
      where book_id = ${ownership.bookId}
        and chapter_number > (select chapter_number from chapters where id = ${chapterId})
        and not exists (
          select 1 from generation_runs
          where project_id = ${ownership.projectId}
            and status in ('queued', 'running', 'awaiting_input')
            and kind <> 'export'
        )
    `,
    tx`
      delete from chapters
      where id = ${chapterId}
        and not exists (
          select 1 from generation_runs
          where project_id = ${ownership.projectId}
            and status in ('queued', 'running', 'awaiting_input')
            and kind <> 'export'
        )
    `,
    tx`
      update chapters
      set chapter_number = chapter_number - 100001
      where book_id = ${ownership.bookId}
        and chapter_number > 100000
        and not exists (
          select 1 from generation_runs
          where project_id = ${ownership.projectId}
            and status in ('queued', 'running', 'awaiting_input')
            and kind <> 'export'
        )
    `,
  ]);
  if (!(allowed as Array<{ allowed: boolean }>)[0]?.allowed) {
    throw new Error("Finish or stop the current run before changing the manuscript");
  }
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
  await assertNoActiveAuthoringRun(projectId);

  const insertAt = Math.max(0, Math.trunc(afterNumber)) + 1;
  const [, allowed] = await getSqlClient().transaction((tx) => [
    tx`select pg_advisory_xact_lock(
      hashtextextended('sopher:project-authoring:' || ${projectId}, 0)
    )`,
    tx`
      select not exists (
        select 1 from generation_runs
        where project_id = ${projectId}
          and status in ('queued', 'running', 'awaiting_input')
          and kind <> 'export'
      ) as allowed
    `,
    tx`
      update chapters
      set chapter_number = chapter_number + 100000
      where book_id = ${book.id}
        and chapter_number >= ${insertAt}
        and not exists (
          select 1 from generation_runs
          where project_id = ${projectId}
            and status in ('queued', 'running', 'awaiting_input')
            and kind <> 'export'
        )
    `,
    tx`
      update chapters
      set chapter_number = chapter_number - 99999
      where book_id = ${book.id}
        and chapter_number > 100000
        and not exists (
          select 1 from generation_runs
          where project_id = ${projectId}
            and status in ('queued', 'running', 'awaiting_input')
            and kind <> 'export'
        )
    `,
    tx`
      insert into chapters (book_id, chapter_number, status, content)
      select ${book.id}, ${insertAt}, 'drafted', ''
      where not exists (
        select 1 from generation_runs
        where project_id = ${projectId}
          and status in ('queued', 'running', 'awaiting_input')
          and kind <> 'export'
      )
    `,
  ]);
  if (!(allowed as Array<{ allowed: boolean }>)[0]?.allowed) {
    throw new Error("Finish or stop the current run before changing the manuscript");
  }
  revalidatePath(`/projects/${projectId}`);
  return { chapterNumber: insertAt };
}

/** Moves a chapter up or down one slot by swapping numbers with its neighbour. */
export async function moveChapter(chapterId: string, direction: "up" | "down"): Promise<void> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(chapterId).success) throw new Error("Chapter not found");

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) throw new Error("Chapter not found");
  await assertNoActiveAuthoringRun(ownership.projectId);

  const delta = direction === "up" ? -1 : 1;
  const [, allowed] = await getSqlClient().transaction((tx) => [
    tx`select pg_advisory_xact_lock(
      hashtextextended('sopher:project-authoring:' || ${ownership.projectId}, 0)
    )`,
    tx`
      select not exists (
        select 1 from generation_runs
        where project_id = ${ownership.projectId}
          and status in ('queued', 'running', 'awaiting_input')
          and kind <> 'export'
      ) as allowed
    `,
    tx`
      update chapters as target
      set chapter_number = -target.chapter_number
      where target.id = ${chapterId}
        and exists (
          select 1 from chapters as neighbour
          where neighbour.book_id = target.book_id
            and neighbour.chapter_number = target.chapter_number + ${delta}
        )
        and not exists (
          select 1 from generation_runs
          where project_id = ${ownership.projectId}
            and status in ('queued', 'running', 'awaiting_input')
            and kind <> 'export'
        )
    `,
    tx`
      update chapters as neighbour
      set chapter_number = -target.chapter_number
      from chapters as target
      where target.id = ${chapterId}
        and target.chapter_number < 0
        and neighbour.book_id = target.book_id
        and neighbour.chapter_number = -target.chapter_number + ${delta}
        and not exists (
          select 1 from generation_runs
          where project_id = ${ownership.projectId}
            and status in ('queued', 'running', 'awaiting_input')
            and kind <> 'export'
        )
    `,
    tx`
      update chapters
      set chapter_number = -chapter_number + ${delta}
      where id = ${chapterId}
        and chapter_number < 0
        and not exists (
          select 1 from generation_runs
          where project_id = ${ownership.projectId}
            and status in ('queued', 'running', 'awaiting_input')
            and kind <> 'export'
        )
    `,
  ]);
  if (!(allowed as Array<{ allowed: boolean }>)[0]?.allowed) {
    throw new Error("Finish or stop the current run before changing the manuscript");
  }
  revalidatePath(`/projects/${ownership.projectId}`);
}

/** Revision history for the editor's History panel, newest first. */
export async function listChapterRevisions(chapterId: string) {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(chapterId).success) throw new Error("Chapter not found");
  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) throw new Error("Chapter not found");

  const revisions = await getDb()
    .select({
      id: schema.chapterRevisions.id,
      content: schema.chapterRevisions.content,
      source: schema.chapterRevisions.source,
      createdAt: schema.chapterRevisions.createdAt,
    })
    .from(schema.chapterRevisions)
    .where(eq(schema.chapterRevisions.chapterId, chapterId))
    .orderBy(sql`${schema.chapterRevisions.createdAt} desc`)
    .limit(30);
  return revisions.map((revision) => ({
    ...revision,
    source: isGenerationResetSource(revision.source) ? "generation-reset" : revision.source,
  }));
}

/**
 * Restores a past revision by saving it as the newest content. Restoring is
 * itself a save, so the pre-restore text lands in the history too — nothing is
 * ever lost by restoring.
 */
export async function restoreChapterRevision(
  chapterId: string,
  revisionId: string,
): Promise<SaveChapterResult> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(revisionId).success) return { ok: false, error: "not_found" };
  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) return { ok: false, error: "not_found" };
  if (await hasActiveAuthoringRun(ownership.projectId)) {
    const [current] = await getDb()
      .select({ version: schema.chapters.version })
      .from(schema.chapters)
      .where(eq(schema.chapters.id, chapterId))
      .limit(1);
    return {
      ok: false,
      error: "conflict",
      currentVersion: current?.version ?? 0,
    };
  }

  const db = getDb();
  const [revision] = await db
    .select({ content: schema.chapterRevisions.content })
    .from(schema.chapterRevisions)
    .where(
      and(
        eq(schema.chapterRevisions.id, revisionId),
        eq(schema.chapterRevisions.chapterId, chapterId),
      ),
    )
    .limit(1);
  if (!revision) return { ok: false, error: "not_found" };

  const [current] = await db
    .select({ content: schema.chapters.content, version: schema.chapters.version })
    .from(schema.chapters)
    .where(eq(schema.chapters.id, chapterId))
    .limit(1);
  if (!current) return { ok: false, error: "not_found" };

  // Snapshot what is being replaced, then force-save the revision content.
  await db
    .insert(schema.chapterRevisions)
    .values({ chapterId, content: current.content, source: "pre-restore" });
  return saveChapter(chapterId, revision.content, current.version, { force: true });
}

export type RestoreArchivedChapterResult =
  | { ok: true; chapterNumber: number; version: number }
  | { ok: false; error: "not_found" | "not_archived" | "active_run" | "conflict" };

/**
 * Returns a soft-retired chapter to the manuscript from the selected
 * generation-reset snapshot. The archive row stays intact, while the chapter
 * becomes drafted (and therefore visible/editable) only after the guarded
 * update succeeds.
 */
export async function restoreArchivedChapter(
  chapterId: string,
  revisionId: string,
): Promise<RestoreArchivedChapterResult> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(chapterId).success || !z.uuid().safeParse(revisionId).success) {
    return { ok: false, error: "not_found" };
  }

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) return { ok: false, error: "not_found" };
  if (await hasActiveAuthoringRun(ownership.projectId)) {
    return { ok: false, error: "active_run" };
  }

  const db = getDb();
  const [[chapter], [revision]] = await Promise.all([
    db
      .select({
        chapterNumber: schema.chapters.chapterNumber,
        title: schema.chapters.title,
        summary: schema.chapters.summary,
        content: schema.chapters.content,
        wordCount: schema.chapters.wordCount,
        status: schema.chapters.status,
        version: schema.chapters.version,
      })
      .from(schema.chapters)
      .where(eq(schema.chapters.id, chapterId))
      .limit(1),
    db
      .select({
        content: schema.chapterRevisions.content,
        source: schema.chapterRevisions.source,
      })
      .from(schema.chapterRevisions)
      .where(
        and(
          eq(schema.chapterRevisions.id, revisionId),
          eq(schema.chapterRevisions.chapterId, chapterId),
          sql`${schema.chapterRevisions.source} like 'generation-reset%'`,
        ),
      )
      .limit(1),
  ]);

  if (!chapter || !revision) return { ok: false, error: "not_found" };
  if (chapter.status !== "planned" || chapter.wordCount !== 0 || chapter.content.length > 0) {
    return { ok: false, error: "not_archived" };
  }

  const metadata = generationResetMetadata(revision.source ?? "generation-reset");
  const [restored] = await db
    .update(schema.chapters)
    .set({
      content: revision.content,
      wordCount: countWords(revision.content),
      title: metadata?.title ?? chapter.title,
      summary: metadata?.summary ?? chapter.summary,
      status: metadata?.status ?? "drafted",
      version: sql`${schema.chapters.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.chapters.id, chapterId),
        eq(schema.chapters.version, chapter.version),
        eq(schema.chapters.status, "planned"),
        eq(schema.chapters.wordCount, 0),
        eq(schema.chapters.content, ""),
        noActiveAuthoringRunSql(ownership.projectId),
      ),
    )
    .returning({
      chapterNumber: schema.chapters.chapterNumber,
      version: schema.chapters.version,
    });

  if (!restored) return { ok: false, error: "conflict" };
  revalidatePath(`/projects/${ownership.projectId}`);
  return { ok: true, chapterNumber: restored.chapterNumber, version: restored.version };
}

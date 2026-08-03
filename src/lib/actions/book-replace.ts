"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb, schema, withDbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";
import { requireUser } from "@/lib/auth";
import { countWords } from "@/lib/editor/anchors";
import {
  BOOK_REPLACE_REVISION_SOURCE,
  matchingEntityNames,
  planBookReplace,
  renameEntity,
  replaceAllInText,
  type ChapterReplacePreview,
} from "@/lib/editor/replace-plan";
import {
  ACTIVE_AUTHORING_RUN_STATUSES,
  noActiveAuthoringRunSql,
  reconcileBeforeAuthoringRunConflict,
} from "@/lib/generation-runs";

/**
 * Book-wide find & replace: the rename-a-character operation. Deterministic and
 * free — no model is involved, so there is nothing to meter and no idempotency
 * key to carry.
 *
 * The author previews first and applies second, and the versions returned by
 * the preview are replayed as the write guard. That is what makes the open
 * editor tab safe: if its autosave landed between the two calls, the guard
 * fails and the whole replace rolls back instead of silently overwriting the
 * newer prose.
 */

/** Distinct history source, so "Before a book-wide replace" is one undo away. */

/** Mirrors saveChapter's ceiling — a replace must not smuggle past it. */
const MAX_CONTENT_CHARS = 400_000;

const MAX_QUERY_CHARS = 200;

const replaceOptionsSchema = z.object({
  query: z.string().min(1).max(MAX_QUERY_CHARS),
  replacement: z.string().max(MAX_QUERY_CHARS).default(""),
  caseSensitive: z.boolean().default(false),
  wholeWord: z.boolean().default(false),
});

const applySchema = replaceOptionsSchema.extend({
  /** Exactly the chapters the author ticked, each with the previewed version. */
  chapters: z
    .array(z.object({ chapterId: z.uuid(), version: z.number().int().nonnegative() }))
    .min(1)
    .max(1_000),
  /** Story Bible entries the author opted into renaming alongside the prose. */
  entityIds: z.array(z.uuid()).max(500).default([]),
  /** The chapter open in the editor, if any — its new prose comes back inline. */
  currentChapterId: z.uuid().nullable().default(null),
});

export type BookReplaceEntityMatch = {
  entityId: string;
  kind: string;
  name: string;
  aliases: string[];
  nameMatches: boolean;
  matchingAliases: string[];
  nextName: string;
  nextAliases: string[];
};

export type BookReplacePreviewResult =
  | {
      ok: true;
      totalMatches: number;
      chapters: ChapterReplacePreview[];
      entities: BookReplaceEntityMatch[];
    }
  | { ok: false; error: "invalid" | "not_found"; message: string };

export type BookReplaceConflict = {
  chapterId: string;
  chapterNumber: number | null;
  expectedVersion: number;
  currentVersion: number | null;
};

export type BookReplaceResult =
  | {
      ok: true;
      chaptersChanged: number;
      replacements: number;
      entitiesRenamed: number;
      /** Present when the open chapter changed, so the editor can adopt it. */
      currentChapter: { content: string; version: number; wordCount: number } | null;
    }
  | {
      ok: false;
      error: "invalid" | "not_found" | "active_run" | "conflict" | "duplicate" | "too_large";
      message: string;
      conflicts?: BookReplaceConflict[];
    };

const MESSAGES = {
  invalid: "Check the search and replacement text, then try again.",
  not_found: "This book was not found.",
  active_run: "Finish or stop the current authoring run before replacing text across the book.",
  conflict:
    "A chapter changed while you were reviewing this replace. Nothing was written — refresh the preview and try again.",
  duplicate:
    "That rename would give two Story Bible entries of the same type the same name. Rename the entry directly instead.",
  too_large: "That replacement would push a chapter past its size limit.",
} as const;

function failure(
  error: Exclude<BookReplaceResult, { ok: true }>["error"],
  conflicts?: BookReplaceConflict[],
): Exclude<BookReplaceResult, { ok: true }> {
  return { ok: false, error, message: MESSAGES[error], ...(conflicts ? { conflicts } : {}) };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string };
  return value.code === "23505" || Boolean(value.message?.includes("uq_entity_name"));
}

async function ownedBookId(projectId: string, userId: string): Promise<string | null> {
  const [book] = await getDb()
    .select({ id: schema.books.id })
    .from(schema.books)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return book?.id ?? null;
}

/**
 * Read-only: what a book-wide replace would touch. Returns per-chapter match
 * counts with a snippet each, plus the Story Bible entries whose name or
 * aliases match — renaming a character in the prose and leaving the canon
 * behind is the failure this preview exists to prevent.
 */
export async function previewBookReplace(
  projectId: string,
  input: unknown,
): Promise<BookReplacePreviewResult> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(projectId).success) {
    return { ok: false, error: "not_found", message: MESSAGES.not_found };
  }
  const parsed = replaceOptionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", message: MESSAGES.invalid };
  const { query, replacement, ...options } = parsed.data;

  const bookId = await ownedBookId(projectId, userId);
  if (!bookId) return { ok: false, error: "not_found", message: MESSAGES.not_found };

  const db = getDb();
  const [chapterRows, entityRows] = await Promise.all([
    db
      .select({
        chapterId: schema.chapters.id,
        chapterNumber: schema.chapters.chapterNumber,
        title: schema.chapters.title,
        content: schema.chapters.content,
        version: schema.chapters.version,
      })
      .from(schema.chapters)
      .where(eq(schema.chapters.bookId, bookId))
      .orderBy(schema.chapters.chapterNumber),
    db
      .select({
        id: schema.entities.id,
        kind: schema.entities.kind,
        name: schema.entities.name,
        aliases: schema.entities.aliases,
      })
      .from(schema.entities)
      .where(eq(schema.entities.bookId, bookId)),
  ]);

  const chapters = planBookReplace(chapterRows, query, options);
  const entities: BookReplaceEntityMatch[] = [];
  for (const row of entityRows) {
    const aliases = row.aliases ?? [];
    const matches = matchingEntityNames({ name: row.name, aliases }, query, options);
    if (!matches.nameMatches && matches.matchingAliases.length === 0) continue;
    const renamed = renameEntity({ name: row.name, aliases }, query, replacement, options);
    entities.push({
      entityId: row.id,
      kind: row.kind,
      name: row.name,
      aliases,
      ...matches,
      nextName: renamed.name,
      nextAliases: renamed.aliases,
    });
  }

  return {
    ok: true,
    totalMatches: chapters.reduce((sum, chapter) => sum + chapter.matchCount, 0),
    chapters,
    entities,
  };
}

type ApplyOutcome =
  | {
      status: "applied";
      chaptersChanged: number;
      replacements: number;
      entitiesRenamed: number;
      currentChapter: { content: string; version: number; wordCount: number } | null;
    }
  | { status: "not_found" | "active_run" | "too_large" }
  | { status: "conflict"; conflicts: BookReplaceConflict[] };

/**
 * Transactional apply. Everything happens under the project authoring lock in
 * one transaction: chapters that moved abort the whole replace, each touched
 * chapter is snapshotted into chapter_revisions before its update, and the
 * update itself carries saveChapter's version guard. The advisory lock
 * serializes this against the other project-wide mutations; the version guard
 * is what defends against a plain autosave, which does not take that lock.
 */
export async function applyBookReplace(
  projectId: string,
  input: unknown,
): Promise<BookReplaceResult> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(projectId).success) return failure("not_found");
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return failure("invalid");
  const { query, replacement, chapters, entityIds, currentChapterId, ...options } = parsed.data;

  await reconcileBeforeAuthoringRunConflict({ projectId, userId });

  const expectedVersions = new Map(chapters.map((chapter) => [chapter.chapterId, chapter.version]));
  const chapterIds = [...expectedVersions.keys()];

  let outcome: ApplyOutcome;
  try {
    outcome = await withDbTransaction(async (tx): Promise<ApplyOutcome> => {
      await lockProjectAuthoring(tx, projectId);

      const [book] = await tx
        .select({ id: schema.books.id })
        .from(schema.books)
        .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
        .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
        .limit(1);
      if (!book) return { status: "not_found" };

      const [activeRun] = await tx
        .select({ id: schema.generationRuns.id })
        .from(schema.generationRuns)
        .where(
          and(
            eq(schema.generationRuns.projectId, projectId),
            inArray(schema.generationRuns.status, [...ACTIVE_AUTHORING_RUN_STATUSES]),
            ne(schema.generationRuns.kind, "export"),
          ),
        )
        .limit(1);
      if (activeRun) return { status: "active_run" };

      const rows = await tx
        .select({
          id: schema.chapters.id,
          chapterNumber: schema.chapters.chapterNumber,
          content: schema.chapters.content,
          version: schema.chapters.version,
        })
        .from(schema.chapters)
        .where(and(eq(schema.chapters.bookId, book.id), inArray(schema.chapters.id, chapterIds)));

      // A chapter that vanished (deleted, or never in this book) is a conflict,
      // not a silent skip — the author approved a plan that no longer holds.
      const found = new Map(rows.map((row) => [row.id, row]));
      const conflicts: BookReplaceConflict[] = [];
      for (const [chapterId, expectedVersion] of expectedVersions) {
        const row = found.get(chapterId);
        if (!row || row.version !== expectedVersion) {
          conflicts.push({
            chapterId,
            chapterNumber: row?.chapterNumber ?? null,
            expectedVersion,
            currentVersion: row?.version ?? null,
          });
        }
      }
      if (conflicts.length > 0) return { status: "conflict", conflicts };

      const edits = rows
        .map((row) => ({ row, next: replaceAllInText(row.content, query, replacement, options) }))
        .filter((edit) => edit.next.replaced > 0);
      if (edits.some((edit) => edit.next.text.length > MAX_CONTENT_CHARS)) {
        return { status: "too_large" };
      }

      let currentChapter: { content: string; version: number; wordCount: number } | null = null;
      let replacements = 0;
      if (edits.length > 0) {
        await tx.insert(schema.chapterRevisions).values(
          edits.map((edit) => ({
            chapterId: edit.row.id,
            content: edit.row.content,
            source: BOOK_REPLACE_REVISION_SOURCE,
          })),
        );
      }
      for (const edit of edits) {
        const wordCount = countWords(edit.next.text);
        const [updated] = await tx
          .update(schema.chapters)
          .set({
            content: edit.next.text,
            wordCount,
            version: edit.row.version + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.chapters.id, edit.row.id),
              eq(schema.chapters.version, edit.row.version),
              noActiveAuthoringRunSql(projectId),
            ),
          )
          .returning({ version: schema.chapters.version });
        if (!updated) {
          // Lost the race with an autosave inside our own transaction window.
          // Returning a conflict rolls back every other chapter with it.
          return {
            status: "conflict",
            conflicts: [
              {
                chapterId: edit.row.id,
                chapterNumber: edit.row.chapterNumber,
                expectedVersion: edit.row.version,
                currentVersion: null,
              },
            ],
          };
        }
        replacements += edit.next.replaced;
        if (edit.row.id === currentChapterId) {
          currentChapter = { content: edit.next.text, version: updated.version, wordCount };
        }
      }

      let entitiesRenamed = 0;
      if (entityIds.length > 0) {
        const entityRows = await tx
          .select({
            id: schema.entities.id,
            name: schema.entities.name,
            aliases: schema.entities.aliases,
          })
          .from(schema.entities)
          .where(and(eq(schema.entities.bookId, book.id), inArray(schema.entities.id, entityIds)));
        for (const row of entityRows) {
          const renamed = renameEntity(
            { name: row.name, aliases: row.aliases ?? [] },
            query,
            replacement,
            options,
          );
          if (!renamed.changed) continue;
          await tx
            .update(schema.entities)
            .set({ name: renamed.name, aliases: renamed.aliases, updatedAt: new Date() })
            .where(eq(schema.entities.id, row.id));
          entitiesRenamed += 1;
        }
      }

      return {
        status: "applied",
        chaptersChanged: edits.length,
        replacements,
        entitiesRenamed,
        currentChapter,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return failure("duplicate");
    console.error("Could not apply book-wide replace", { projectId, error });
    return failure("conflict");
  }

  if (outcome.status === "conflict") return failure("conflict", outcome.conflicts);
  if (outcome.status !== "applied") return failure(outcome.status);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/manuscript`);
  if (outcome.entitiesRenamed > 0) revalidatePath(`/projects/${projectId}/bible`);
  return {
    ok: true,
    chaptersChanged: outcome.chaptersChanged,
    replacements: outcome.replacements,
    entitiesRenamed: outcome.entitiesRenamed,
    currentChapter: outcome.currentChapter,
  };
}

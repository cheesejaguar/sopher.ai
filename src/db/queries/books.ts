import { cache } from "react";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { countWords } from "@/lib/editor/anchors";
import { validFullBookCompletionExistsSql } from "@/lib/run-completion-proof";

type ChapterVisibilitySeed = {
  status: "planned" | "drafting" | "drafted" | "edited" | "final";
  title: string | null;
  summary: string | null;
  wordCount: number;
};

/**
 * A reduced full-book run keeps surplus chapter rows so their revision history
 * remains recoverable. prepareBookRunStep turns those rows into empty,
 * untitled planned placeholders; all manuscript surfaces treat that exact
 * shape as soft-retired. A user-inserted blank chapter remains visible because
 * structural inserts use the drafted status.
 */
export function isVisibleManuscriptChapter(chapter: ChapterVisibilitySeed): boolean {
  return !isSoftRetiredManuscriptChapter(chapter);
}

export function isSoftRetiredManuscriptChapter(chapter: ChapterVisibilitySeed): boolean {
  return (
    chapter.status === "planned" &&
    chapter.wordCount === 0 &&
    chapter.title === null &&
    chapter.summary === null
  );
}

type ArchivedChapterRevisionRow = {
  chapterId: string;
  chapterNumber: number;
  revisionId: string;
  content: string;
  createdAt: Date;
};

export type ArchivedChapterRecovery = {
  chapterId: string;
  chapterNumber: number;
  revisionId: string;
  archivedAt: Date;
  wordCount: number;
  excerpt: string;
};

const ARCHIVED_EXCERPT_CHARS = 280;

/**
 * Selects the newest generation-reset snapshot for each currently retired
 * chapter. Kept pure so recovery ordering and metadata can be regression
 * tested without a database.
 */
export function latestArchivedChapterRecoveries(
  rows: ArchivedChapterRevisionRow[],
): ArchivedChapterRecovery[] {
  const latestByChapter = new Map<number, ArchivedChapterRevisionRow>();
  for (const row of rows) {
    const current = latestByChapter.get(row.chapterNumber);
    if (!current || row.createdAt.getTime() > current.createdAt.getTime()) {
      latestByChapter.set(row.chapterNumber, row);
    }
  }

  return [...latestByChapter.values()]
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((row) => {
      const normalized = row.content.replace(/\s+/g, " ").trim();
      return {
        chapterId: row.chapterId,
        chapterNumber: row.chapterNumber,
        revisionId: row.revisionId,
        archivedAt: row.createdAt,
        wordCount: countWords(row.content),
        excerpt:
          normalized.length > ARCHIVED_EXCERPT_CHARS
            ? `${normalized.slice(0, ARCHIVED_EXCERPT_CHARS).trimEnd()}…`
            : normalized,
      };
    });
}

/**
 * Project + its book row (book may be null before first generation).
 * Single LEFT JOIN (uq_books_project guarantees at most one book) and
 * per-request deduped so layout/metadata/page share one execution.
 */
export const getProjectWithBook = cache(async (userId: string, projectId: string) => {
  const db = getDb();
  const [row] = await db
    .select({
      project: schema.projects,
      book: schema.books,
      fullBookCompletionReady: validFullBookCompletionExistsSql(sql.raw('"projects"."id"')),
    })
    .from(schema.projects)
    .leftJoin(schema.books, eq(schema.books.projectId, schema.projects.id))
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!row) return null;
  return {
    project: row.project,
    book: row.book ?? null,
    fullBookCompletionReady: row.fullBookCompletionReady,
  };
});

export const getChapterList = cache(async (bookId: string) => {
  const db = getDb();
  const chapters = await db
    .select({
      id: schema.chapters.id,
      chapterNumber: schema.chapters.chapterNumber,
      title: schema.chapters.title,
      summary: schema.chapters.summary,
      wordCount: schema.chapters.wordCount,
      status: schema.chapters.status,
      version: schema.chapters.version,
      qualityScore: schema.chapters.qualityScore,
      updatedAt: schema.chapters.updatedAt,
    })
    .from(schema.chapters)
    .where(eq(schema.chapters.bookId, bookId))
    .orderBy(schema.chapters.chapterNumber);
  return chapters.filter(isVisibleManuscriptChapter);
});

/**
 * Recovery shelf for every blank chapter reset by a fresh generation. This
 * includes target chapters if preparation later failed, not only surplus rows
 * soft-retired by a shorter book, so no archived prose becomes inaccessible.
 */
export const getArchivedChapterRecoveries = cache(async (bookId: string) => {
  const db = getDb();
  const rows = await db
    .select({
      chapterId: schema.chapters.id,
      chapterNumber: schema.chapters.chapterNumber,
      revisionId: schema.chapterRevisions.id,
      content: schema.chapterRevisions.content,
      createdAt: schema.chapterRevisions.createdAt,
    })
    .from(schema.chapters)
    .innerJoin(schema.chapterRevisions, eq(schema.chapterRevisions.chapterId, schema.chapters.id))
    .where(
      and(
        eq(schema.chapters.bookId, bookId),
        eq(schema.chapters.status, "planned"),
        eq(schema.chapters.wordCount, 0),
        eq(schema.chapters.content, ""),
        sql`${schema.chapterRevisions.source} like 'generation-reset%'`,
      ),
    )
    .orderBy(schema.chapters.chapterNumber, desc(schema.chapterRevisions.createdAt));

  return latestArchivedChapterRecoveries(rows);
});

export const getChapterWithContent = cache(async (bookId: string, chapterNumber: number) => {
  const db = getDb();
  const [chapter] = await db
    .select()
    .from(schema.chapters)
    .where(
      and(eq(schema.chapters.bookId, bookId), eq(schema.chapters.chapterNumber, chapterNumber)),
    )
    .limit(1);
  return chapter && isVisibleManuscriptChapter(chapter) ? chapter : null;
});

export async function getChapterById(chapterId: string) {
  const db = getDb();
  const [chapter] = await db
    .select()
    .from(schema.chapters)
    .where(eq(schema.chapters.id, chapterId))
    .limit(1);
  return chapter ?? null;
}

/** The book a chapter belongs to, joined to its project for ownership checks. */
export async function getChapterOwnership(chapterId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      chapterId: schema.chapters.id,
      chapterNumber: schema.chapters.chapterNumber,
      bookId: schema.books.id,
      projectId: schema.projects.id,
      userId: schema.projects.userId,
    })
    .from(schema.chapters)
    .innerJoin(schema.books, eq(schema.chapters.bookId, schema.books.id))
    .innerJoin(schema.projects, eq(schema.books.projectId, schema.projects.id))
    .where(eq(schema.chapters.id, chapterId))
    .limit(1);
  return row ?? null;
}

export async function getLatestOutline(bookId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.outlines)
    .where(eq(schema.outlines.bookId, bookId))
    .orderBy(desc(schema.outlines.version))
    .limit(1);
  return row ?? null;
}

export async function getActiveRun(projectId: string) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
      ),
    )
    .orderBy(desc(schema.generationRuns.createdAt))
    .limit(1);
  return run ?? null;
}

/** Any active manuscript mutation, excluding read-only export rendering. */
export async function getActiveAuthoringRun(projectId: string) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        inArray(schema.generationRuns.kind, ["full_book", "chapter", "edit_pass", "continuity"]),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
      ),
    )
    .orderBy(desc(schema.generationRuns.createdAt))
    .limit(1);
  return run ?? null;
}

export async function getLatestRun(projectId: string) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.generationRuns)
    .where(eq(schema.generationRuns.projectId, projectId))
    .orderBy(desc(schema.generationRuns.createdAt))
    .limit(1);
  return run ?? null;
}

/** The Write surface represents whole-book production, never scoped editor jobs. */
export async function getActiveFullBookRun(projectId: string) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.kind, "full_book"),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
      ),
    )
    .orderBy(desc(schema.generationRuns.createdAt))
    .limit(1);
  return run ?? null;
}

export async function getLatestFullBookRun(projectId: string) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.kind, "full_book"),
      ),
    )
    .orderBy(desc(schema.generationRuns.createdAt))
    .limit(1);
  return run ?? null;
}

/**
 * Active authoring owns the manuscript until it stops. Among terminal runs,
 * whole-book production remains authoritative over later scoped editor work:
 * a chapter or edit pass cannot prove that an interrupted book finished.
 */
export function authoringJourneyRunPrioritySql() {
  return sql<number>`case
    when ${schema.generationRuns.status} in ('queued', 'running', 'awaiting_input') then 0
    when ${schema.generationRuns.kind} = 'full_book' then 1
    else 2
  end`;
}

/** Select the run that currently governs the author's next step. */
export async function getLatestAuthoringJourneyRun(projectId: string) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        inArray(schema.generationRuns.kind, ["full_book", "chapter", "edit_pass", "continuity"]),
      ),
    )
    .orderBy(authoringJourneyRunPrioritySql(), desc(schema.generationRuns.createdAt))
    .limit(1);
  return run ?? null;
}

export async function getProjectSpend(projectId: string) {
  const db = getDb();
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.llmCalls.usd}), 0)` })
    .from(schema.llmCalls)
    .where(eq(schema.llmCalls.projectId, projectId));
  return Number(row?.total ?? 0);
}

export async function getSpendByProject(userId: string, since?: Date) {
  const db = getDb();
  const conditions = [eq(schema.llmCalls.userId, userId)];
  if (since) conditions.push(gte(schema.llmCalls.createdAt, since));
  return db
    .select({
      projectId: schema.llmCalls.projectId,
      title: schema.projects.title,
      usd: sql<string>`sum(${schema.llmCalls.usd})`,
      calls: sql<number>`count(*)::int`,
    })
    .from(schema.llmCalls)
    .leftJoin(schema.projects, eq(schema.llmCalls.projectId, schema.projects.id))
    .where(and(...conditions))
    .groupBy(schema.llmCalls.projectId, schema.projects.title)
    .orderBy(desc(sql`sum(${schema.llmCalls.usd})`));
}

export async function getSpendByRole(userId: string, projectId?: string, since?: Date) {
  const db = getDb();
  const conditions = [eq(schema.llmCalls.userId, userId)];
  if (projectId) conditions.push(eq(schema.llmCalls.projectId, projectId));
  if (since) conditions.push(gte(schema.llmCalls.createdAt, since));
  return db
    .select({
      agentRole: schema.llmCalls.agentRole,
      model: schema.llmCalls.model,
      inputTokens: sql<string>`sum(${schema.llmCalls.inputTokens})`,
      outputTokens: sql<string>`sum(${schema.llmCalls.outputTokens})`,
      cachedInputTokens: sql<string>`sum(${schema.llmCalls.cachedInputTokens})`,
      calls: sql<number>`count(*)::int`,
      usd: sql<string>`sum(${schema.llmCalls.usd})`,
    })
    .from(schema.llmCalls)
    .where(and(...conditions))
    .groupBy(schema.llmCalls.agentRole, schema.llmCalls.model)
    .orderBy(desc(sql`sum(${schema.llmCalls.usd})`));
}

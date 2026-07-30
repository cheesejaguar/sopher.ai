import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export async function listProjects(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.updatedAt));
}

export type ProjectWithStats = Awaited<ReturnType<typeof listProjectsWithStats>>[number];

/**
 * Dashboard listing: every non-archived project with chapter progress, word
 * count, and metered spend — batched into three queries total (no N+1).
 */
export async function listProjectsWithStats(userId: string, opts?: { archived?: boolean }) {
  const db = getDb();
  const projects = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.userId, userId),
        opts?.archived
          ? eq(schema.projects.status, "archived")
          : ne(schema.projects.status, "archived"),
      ),
    )
    .orderBy(desc(schema.projects.updatedAt));
  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);
  const [chapterRows, spendRows] = await Promise.all([
    db
      .select({
        projectId: schema.books.projectId,
        chapterCount: sql<number>`count(${schema.chapters.id}) filter (
          where not (
            ${schema.chapters.status} = 'planned'
            and ${schema.chapters.wordCount} = 0
            and ${schema.chapters.title} is null
            and ${schema.chapters.summary} is null
          )
        )::int`,
        chaptersDone: sql<number>`count(${schema.chapters.id}) filter (where ${schema.chapters.status} in ('drafted', 'edited', 'final'))::int`,
        wordCount: sql<number>`coalesce(sum(${schema.chapters.wordCount}), 0)::int`,
      })
      .from(schema.books)
      .leftJoin(schema.chapters, eq(schema.chapters.bookId, schema.books.id))
      .where(inArray(schema.books.projectId, projectIds))
      .groupBy(schema.books.projectId),
    db
      .select({
        projectId: schema.llmCalls.projectId,
        usd: sql<string>`sum(${schema.llmCalls.usd})`,
      })
      .from(schema.llmCalls)
      .where(inArray(schema.llmCalls.projectId, projectIds))
      .groupBy(schema.llmCalls.projectId),
  ]);

  const chaptersByProject = new Map(chapterRows.map((row) => [row.projectId, row]));
  const spendByProject = new Map(spendRows.map((row) => [row.projectId, Number(row.usd)]));

  return projects.map((project) => {
    const chapterStats = chaptersByProject.get(project.id);
    return {
      ...project,
      chaptersDone: chapterStats?.chaptersDone ?? 0,
      chaptersTotal: Math.max(project.targetChapters, chapterStats?.chapterCount ?? 0),
      wordCount: chapterStats?.wordCount ?? 0,
      spendUsd: spendByProject.get(project.id) ?? 0,
    };
  });
}

export async function getProject(userId: string, projectId: string) {
  const db = getDb();
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return project ?? null;
}

/** Returns the project's book row, creating it lazily on first access. */
export async function getOrCreateBook(projectId: string, title: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.books)
    .where(eq(schema.books.projectId, projectId))
    .limit(1);
  if (existing) return existing;

  const [book] = await db
    .insert(schema.books)
    .values({ projectId, title })
    .onConflictDoNothing()
    .returning();
  if (book) return book;

  const [raced] = await db
    .select()
    .from(schema.books)
    .where(eq(schema.books.projectId, projectId))
    .limit(1);
  return raced;
}

export async function listChapters(bookId: string) {
  const db = getDb();
  return db
    .select({
      id: schema.chapters.id,
      chapterNumber: schema.chapters.chapterNumber,
      title: schema.chapters.title,
      summary: schema.chapters.summary,
      wordCount: schema.chapters.wordCount,
      status: schema.chapters.status,
      version: schema.chapters.version,
      updatedAt: schema.chapters.updatedAt,
    })
    .from(schema.chapters)
    .where(eq(schema.chapters.bookId, bookId))
    .orderBy(schema.chapters.chapterNumber);
}

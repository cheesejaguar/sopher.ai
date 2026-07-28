import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Project + its book row (book may be null before first generation). */
export async function getProjectWithBook(userId: string, projectId: string) {
  const db = getDb();
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return null;
  const [book] = await db
    .select()
    .from(schema.books)
    .where(eq(schema.books.projectId, projectId))
    .limit(1);
  return { project, book: book ?? null };
}

export async function getChapterList(bookId: string) {
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
      qualityScore: schema.chapters.qualityScore,
      updatedAt: schema.chapters.updatedAt,
    })
    .from(schema.chapters)
    .where(eq(schema.chapters.bookId, bookId))
    .orderBy(schema.chapters.chapterNumber);
}

export async function getChapterWithContent(bookId: string, chapterNumber: number) {
  const db = getDb();
  const [chapter] = await db
    .select()
    .from(schema.chapters)
    .where(
      and(eq(schema.chapters.bookId, bookId), eq(schema.chapters.chapterNumber, chapterNumber)),
    )
    .limit(1);
  return chapter ?? null;
}

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

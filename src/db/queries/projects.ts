import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export async function listProjects(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.updatedAt));
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

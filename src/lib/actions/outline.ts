"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { bookOutlineSchema } from "@/ai/schemas";

/**
 * Saves an author-edited outline as a new version with source "user" — the
 * enum value that existed since the schema was written and was never used.
 * Versions are append-only; the agents' original stays in the history.
 */
export async function saveOutline(projectId: string, input: unknown): Promise<void> {
  const { userId } = await requireUser();
  const outline = bookOutlineSchema.parse(input);

  const db = getDb();
  const [book] = await db
    .select({ id: schema.books.id })
    .from(schema.books)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!book) throw new Error("Book not found");

  // An in-flight run reads the latest outline mid-stream; editing under it
  // would hand different chapters different plans.
  const [active] = await db
    .select({ id: schema.generationRuns.id })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        inArray(schema.generationRuns.status, ["queued", "running"]),
      ),
    )
    .limit(1);
  if (active) throw new Error("Finish or stop the current run before editing the outline");

  const [latest] = await db
    .select({ version: schema.outlines.version })
    .from(schema.outlines)
    .where(eq(schema.outlines.bookId, book.id))
    .orderBy(sql`${schema.outlines.version} desc`)
    .limit(1);

  await db.insert(schema.outlines).values({
    bookId: book.id,
    version: (latest?.version ?? 0) + 1,
    content: outline,
    source: "user",
  });
  revalidatePath(`/projects/${projectId}/outline`);
}

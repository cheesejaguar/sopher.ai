"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";

const updateBookSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  synopsis: z.string().max(2_000).nullable().optional(),
  /** Author byline used on the title page and in every export. */
  author: z.string().max(200).nullable().optional(),
});

export type UpdateBookInput = z.infer<typeof updateBookSchema>;

/**
 * Edits the book's identity — title, synopsis, author byline. The concept
 * agent proposes these once; from then on they belong to the author. The
 * byline lives in books.front_matter so exports and the reading view share it.
 */
export async function updateBook(projectId: string, input: unknown): Promise<void> {
  const { userId } = await requireUser();
  const data = updateBookSchema.parse(input);

  const db = getDb();
  const [book] = await db
    .select({ id: schema.books.id, frontMatter: schema.books.frontMatter })
    .from(schema.books)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!book) throw new Error("Book not found");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) patch.title = data.title.trim();
  if (data.synopsis !== undefined) patch.synopsis = data.synopsis?.trim() || null;
  if (data.author !== undefined) {
    const front = { ...(book.frontMatter as Record<string, unknown>) };
    if (data.author?.trim()) front.author = data.author.trim();
    else delete front.author;
    patch.frontMatter = front;
  }

  await db.update(schema.books).set(patch).where(eq(schema.books.id, book.id));
  // Title lives on both rows — the studio grid and project header read the
  // project, exports and the reading view read the book. Keep them mirrored so
  // neither edit path leaves the other surface stale.
  if (data.title !== undefined) {
    await db
      .update(schema.projects)
      .set({ title: data.title.trim(), updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId));
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/studio");
}

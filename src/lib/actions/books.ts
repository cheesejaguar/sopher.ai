"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema, withDbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";
import { requireUser } from "@/lib/auth";
import { bookMatterSchema } from "@/lib/book-package";

const updateBookSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  synopsis: z.string().max(2_000).nullable().optional(),
  /** Author byline used on the title page and in every export. */
  author: z.string().max(200).nullable().optional(),
});

export type UpdateBookInput = z.infer<typeof updateBookSchema>;

const editableBookMatterSchema = bookMatterSchema
  .omit({ coverUrl: true })
  .partial()
  .extend({
    title: z.string().min(1).max(300),
    synopsis: z.string().max(2_000).optional(),
  });

export type UpdateBookPackageInput = z.infer<typeof editableBookMatterSchema>;

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

/**
 * Saves the complete publication package from the dedicated Book setup page.
 * Empty optional fields are removed so exporters never create blank pages;
 * generated-cover metadata and future unknown keys remain untouched.
 */
export async function updateBookPackage(projectId: string, input: unknown): Promise<void> {
  const { userId } = await requireUser();
  const data = editableBookMatterSchema.parse(input);

  await withDbTransaction(async (tx) => {
    // Cover delivery and every other project-wide authoring mutation use this
    // lock. Take it before snapshotting frontMatter so a concurrent cover can
    // never be replaced by the stale JSON object assembled below.
    await lockProjectAuthoring(tx, projectId);
    const [book] = await tx
      .select({ id: schema.books.id, frontMatter: schema.books.frontMatter })
      .from(schema.books)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
      .limit(1);
    if (!book) throw new Error("Book not found");

    const nextMatter = { ...(book.frontMatter as Record<string, unknown>) };
    for (const [key, value] of Object.entries(data)) {
      if (key === "title" || key === "synopsis" || key === "copyrightYear") continue;
      if (typeof value === "string" && value.trim()) nextMatter[key] = value.trim();
      else delete nextMatter[key];
    }
    if (typeof data.copyrightYear === "number") nextMatter.copyrightYear = data.copyrightYear;
    else delete nextMatter.copyrightYear;

    const now = new Date();
    await tx
      .update(schema.books)
      .set({
        title: data.title.trim(),
        synopsis: data.synopsis?.trim() || null,
        frontMatter: nextMatter,
        updatedAt: now,
      })
      .where(eq(schema.books.id, book.id));
    await tx
      .update(schema.projects)
      .set({ title: data.title.trim(), updatedAt: now })
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)));
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/book`);
  revalidatePath(`/projects/${projectId}/manuscript`);
  revalidatePath("/studio");
}

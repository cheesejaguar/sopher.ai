"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";

/**
 * Resolve or dismiss a continuity issue. Resolution is a human judgement —
 * the agents only ever open issues; closing them belongs to the author.
 */
export async function setContinuityIssueStatus(
  issueId: string,
  status: "resolved" | "dismissed",
): Promise<void> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(issueId).success) throw new Error("Issue not found");

  const db = getDb();
  // Ownership: issue -> book -> project -> user.
  const [issue] = await db
    .select({ id: schema.continuityIssues.id, projectId: schema.projects.id })
    .from(schema.continuityIssues)
    .innerJoin(schema.books, eq(schema.books.id, schema.continuityIssues.bookId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(and(eq(schema.continuityIssues.id, issueId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!issue) throw new Error("Issue not found");

  await db
    .update(schema.continuityIssues)
    .set({ status })
    .where(eq(schema.continuityIssues.id, issueId));
  revalidatePath(`/projects/${issue.projectId}/bible`);
}

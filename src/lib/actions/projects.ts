"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { createProjectSchema, updateProjectSchema } from "@/lib/validation/project";

export async function createProject(input: unknown) {
  const { userId } = await requireUser();
  const data = createProjectSchema.parse(input);

  const db = getDb();
  const [project] = await db
    .insert(schema.projects)
    .values({
      userId,
      title: data.title,
      brief: data.brief,
      genre: data.genre,
      targetChapters: data.targetChapters,
      targetWordsPerChapter: data.targetWordsPerChapter,
      styleGuide: data.styleGuide,
      settings: data.settings,
    })
    .returning();

  revalidatePath("/studio");
  redirect(`/projects/${project.id}/brief`);
}

export async function updateProject(projectId: string, input: unknown) {
  const { userId } = await requireUser();
  const data = updateProjectSchema.parse(input);

  const db = getDb();
  const [updated] = await db
    .update(schema.projects)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .returning({ id: schema.projects.id });

  if (!updated) throw new Error("Project not found");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/studio");
}

export async function deleteProject(projectId: string) {
  const { userId } = await requireUser();
  const db = getDb();
  const [deleted] = await db
    .delete(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .returning({ id: schema.projects.id });

  if (!deleted) throw new Error("Project not found");
  revalidatePath("/studio");
  redirect("/studio");
}

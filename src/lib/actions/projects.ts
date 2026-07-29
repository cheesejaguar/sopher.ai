"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { start } from "workflow/api";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertNotSuspended, requireUser } from "@/lib/auth";
import { getOrCreateBook } from "@/db/queries/projects";
import { generateBook } from "@/workflows/generate-book";
import { isActiveRunConflict } from "@/lib/run-conflict";
import type { GenerationConfig } from "@/lib/run-events";
import {
  createProjectSchema,
  projectSettingsSchema,
  updateProjectSchema,
} from "@/lib/validation/project";

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

const startBookSchema = z.object({
  title: z.string().min(1).max(200),
  brief: z.string().min(20).max(20_000),
  genre: z.string().min(1).max(60),
  targetChapters: z.number().int().min(3).max(60),
  targetWordsPerChapter: z.number().int().min(800).max(8_000),
  settings: projectSettingsSchema.default({}),
});

/**
 * Shared run-start logic — the server-side equivalent of
 * POST /api/projects/[projectId]/generate, factored out so server actions
 * never HTTP back into their own deployment.
 */
async function startGenerationRun(
  project: { id: string; title: string },
  userId: string,
  config: GenerationConfig,
): Promise<string> {
  const db = getDb();

  const [activeRun] = await db
    .select({ id: schema.generationRuns.id })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, project.id),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
      ),
    )
    .limit(1);
  if (activeRun) throw new Error("A generation run is already in progress");

  await getOrCreateBook(project.id, project.title);

  let run: { id: string };
  try {
    [run] = await db
      .insert(schema.generationRuns)
      .values({
        projectId: project.id,
        userId,
        kind: "full_book",
        status: "queued",
        config,
      })
      .returning({ id: schema.generationRuns.id });
  } catch (error) {
    // The partial unique index is the race-proof backstop behind the pre-check above.
    if (!isActiveRunConflict(error)) throw error;
    throw new Error("A generation run is already in progress");
  }

  const workflowRun = await start(generateBook, [run.id, project.id, userId, config]);
  await db
    .update(schema.generationRuns)
    .set({ workflowRunId: workflowRun.runId })
    .where(eq(schema.generationRuns.id, run.id));

  return run.id;
}

/**
 * The wizard's submit: creates the project and immediately starts the
 * full-book generation workflow, then lands the author on the Write stage.
 */
export async function startBook(input: unknown) {
  const { userId } = await requireUser();
  await assertNotSuspended(userId);
  const data = startBookSchema.parse(input);

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
      settings: data.settings,
    })
    .returning({ id: schema.projects.id, title: schema.projects.title });

  const config: GenerationConfig = {
    tier: data.settings.qualityTier ?? "standard",
    requireOutlineApproval: data.settings.requireOutlineApproval ?? true,
    waveSize: 4,
  };
  await startGenerationRun(project, userId, config);

  revalidatePath("/studio");
  redirect(`/projects/${project.id}/write`);
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
  // Mirror a rename onto the book row so exports and the reading view agree
  // with the dashboard (see updateBook for the reverse direction).
  if (data.title !== undefined) {
    await db
      .update(schema.books)
      .set({ title: data.title, updatedAt: new Date() })
      .where(eq(schema.books.projectId, projectId));
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/studio");
}

/**
 * Archive/unarchive. Restoring derives the status from the book's actual state
 * rather than resetting to draft, so a finished book comes back as finished.
 */
export async function setProjectArchived(projectId: string, archived: boolean) {
  const { userId } = await requireUser();
  const db = getDb();

  let status: "draft" | "editing" | "complete" | "archived" = "archived";
  if (!archived) {
    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        written: sql<number>`count(*) filter (where length(${schema.chapters.content}) > 0)::int`,
      })
      .from(schema.chapters)
      .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
      .where(eq(schema.books.projectId, projectId));
    status =
      stats && stats.written > 0
        ? stats.written >= stats.total
          ? "complete"
          : "editing"
        : "draft";
  }

  const [updated] = await db
    .update(schema.projects)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .returning({ id: schema.projects.id });
  if (!updated) throw new Error("Project not found");
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

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getRun, start } from "workflow/api";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertNotSuspended, requireUser, SuspendedError } from "@/lib/auth";
import { isActionRateLimited, LIMITS } from "@/lib/security/rate-limit";
import { getOrCreateBook } from "@/db/queries/projects";
import { generateBook } from "@/workflows/generate-book";
import { isActiveRunConflict } from "@/lib/run-conflict";
import {
  insertQueuedAuthoringRun,
  noActiveAuthoringRunSql,
  scheduleRunReservationCleanup,
  terminalizeAuthoringRun,
} from "@/lib/generation-runs";
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
  // Structured copies of what composeBrief also folds into the brief text.
  // Kept alongside rather than instead of, so the prose the agents receive is
  // byte-identical to before.
  subgenre: z.string().max(80).optional(),
  protagonist: z.string().max(300).optional(),
  setting: z.string().max(300).optional(),
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
    run = await insertQueuedAuthoringRun({
      projectId: project.id,
      userId,
      kind: "full_book",
      config,
    });
  } catch (error) {
    // The partial unique index is the race-proof backstop behind the pre-check above.
    if (!isActiveRunConflict(error)) throw error;
    throw new Error("A generation run is already in progress");
  }

  let workflowRun: Awaited<ReturnType<typeof start>> | undefined;
  let startAttempted = false;
  try {
    startAttempted = true;
    workflowRun = await start(generateBook, [run.id, project.id, userId, config]);
    await db
      .update(schema.generationRuns)
      .set({ workflowRunId: workflowRun.runId })
      .where(eq(schema.generationRuns.id, run.id));
  } catch (error) {
    if (workflowRun) {
      try {
        await getRun(workflowRun.runId).cancel();
      } catch {
        // Terminal DB state and reservation reconciliation are authoritative.
      }
    }
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: project.id,
      userId,
      status: "failed",
      error: error instanceof Error ? error.message : "Could not start generation",
      releaseImmediately: !startAttempted,
    });
    if (startAttempted) {
      await scheduleRunReservationCleanup({ userId, runId: run.id });
    }
    throw error;
  }

  return run.id;
}

/**
 * The wizard's submit: creates the project and immediately starts the
 * full-book generation workflow, then lands the author on the Write stage.
 */
export async function startBook(input: unknown): Promise<{ error: string } | void> {
  const { userId } = await requireUser();
  // Server-action throw messages are redacted in production, so suspension is
  // returned as data — the wizard shows it verbatim.
  try {
    await assertNotSuspended(userId);
  } catch (error) {
    if (error instanceof SuspendedError) return { error: error.message };
    throw error;
  }
  // The other entry point to a full book run (POST /api/projects/[id]/generate)
  // is rate limited; this one is the wizard's submit and needs the same bound,
  // since each run is the single most expensive thing a user can trigger.
  if (await isActionRateLimited(LIMITS.bookStart, userId)) {
    return { error: "Too many books started at once — give it a moment and try again." };
  }
  const data = startBookSchema.parse(input);

  const db = getDb();
  const [project] = await db
    .insert(schema.projects)
    .values({
      userId,
      title: data.title,
      brief: data.brief,
      genre: data.genre,
      subgenre: data.subgenre ?? null,
      protagonist: data.protagonist ?? null,
      setting: data.setting ?? null,
      targetChapters: data.targetChapters,
      targetWordsPerChapter: data.targetWordsPerChapter,
      settings: data.settings,
    })
    .returning({ id: schema.projects.id, title: schema.projects.title });

  const config: GenerationConfig = {
    tier: data.settings.qualityTier ?? "standard",
    requireOutlineApproval: data.settings.requireOutlineApproval ?? true,
    waveSize: 4,
    targetChapters: data.targetChapters,
    targetWordsPerChapter: data.targetWordsPerChapter,
    inputSnapshot: {
      brief: data.brief,
      genre: data.genre,
      styleGuide: null,
      voiceProfile: data.settings.voiceProfile ?? null,
      pov: data.settings.pov ?? null,
      tense: data.settings.tense ?? null,
      tone: data.settings.tone ?? null,
      styleProfile: data.settings.styleProfile ?? null,
      heatLevel: data.settings.heatLevel ?? null,
      violenceLevel: data.settings.violenceLevel ?? null,
      profanity: data.settings.profanity ?? null,
      avoidTopics: [...(data.settings.avoidTopics ?? [])],
    },
  };
  await startGenerationRun(project, userId, config);

  revalidatePath("/studio");
  redirect(`/projects/${project.id}/write`);
}

export async function updateProject(projectId: string, input: unknown) {
  const { userId } = await requireUser();
  const data = updateProjectSchema.parse(input);

  const db = getDb();
  const outcome = await db.transaction(async (tx) => {
    // The lock is shared with run insertion and outline mutation. Because it
    // is acquired in a statement before these reads, a mutation that started
    // before generation cannot commit after generation's frozen snapshot.
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${projectId}, 0)
      )`,
    );
    const [owned] = await tx
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
      .limit(1);
    if (!owned) return "not_found" as const;

    const [updated] = await tx
      .update(schema.projects)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.userId, userId),
          noActiveAuthoringRunSql(projectId),
        ),
      )
      .returning({ id: schema.projects.id });
    if (!updated) return "active_run" as const;

    // Mirror a rename in the same locked transaction so exports, generation,
    // and the reading view cannot observe two different identities.
    if (data.title !== undefined) {
      await tx
        .update(schema.books)
        .set({ title: data.title, updatedAt: new Date() })
        .where(eq(schema.books.projectId, projectId));
    }
    return "updated" as const;
  });

  if (outcome === "not_found") throw new Error("Project not found");
  if (outcome === "active_run") {
    throw new Error("Finish or stop the current run before changing project settings");
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
        total: sql<number>`count(*) filter (
          where not (
            ${schema.chapters.status} = 'planned'
            and ${schema.chapters.wordCount} = 0
            and ${schema.chapters.title} is null
            and ${schema.chapters.summary} is null
          )
        )::int`,
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
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${projectId}, 0)
      )`,
    );
    const [owned] = await tx
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
      .limit(1);
    if (!owned) return "not_found" as const;

    // Metering intents use this wallet lock. Taking it after the project lock
    // closes the gap between the open-protocol snapshot and cascade delete:
    // a paid call either commits first and blocks deletion, or begins after
    // the project is gone and cannot dispatch provider work.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);

    const [activeRun] = await tx
      .select({ id: schema.generationRuns.id })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.projectId, projectId),
          eq(schema.generationRuns.userId, userId),
          inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
        ),
      )
      .limit(1);
    if (activeRun) return "active_run" as const;

    const [openBillingProtocol] = await tx
      .select({ id: schema.creditLedger.id })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.userId, userId),
          eq(schema.creditLedger.projectId, projectId),
          sql`(
            (
              (
                ${schema.creditLedger.externalRef} like 'generation-reservation:%'
                or ${schema.creditLedger.externalRef} like 'interactive-reservation:%'
              )
              and ${schema.creditLedger.amount} < 0
              and not exists (
                select 1 from credit_ledger released
                where released.external_ref =
                  'release:' || ${schema.creditLedger.externalRef}
              )
            )
            or (
              ${schema.creditLedger.externalRef} like 'metering-intent:%'
              and ${schema.creditLedger.amount} = 0
              and not exists (
                select 1 from credit_ledger terminal
                where terminal.external_ref in (
                  'intent-settled:' || ${schema.creditLedger.externalRef},
                  'intent-aborted:' || ${schema.creditLedger.externalRef}
                )
              )
            )
          )`,
        ),
      )
      .limit(1);
    if (openBillingProtocol) return "open_billing" as const;

    const assetRows = await tx
      .select({ pathname: schema.assets.blobPathname })
      .from(schema.assets)
      .where(eq(schema.assets.projectId, projectId));
    const pathnames = [...new Set(assetRows.map((asset) => asset.pathname).filter(Boolean))];
    if (pathnames.length > 0) {
      // Start the durable cleanup before deleting. Its delayed step checks
      // that this transaction committed; if start fails, the transaction
      // aborts and no Blob pathname is lost.
      const [{ start }, { cleanupProjectBlobsAfterDelete }] = await Promise.all([
        import("workflow/api"),
        import("@/workflows/cleanup-project-blobs"),
      ]);
      await start(cleanupProjectBlobsAfterDelete, [projectId, pathnames]);
    }

    const [deleted] = await tx
      .delete(schema.projects)
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.userId, userId),
          noActiveAuthoringRunSql(projectId),
        ),
      )
      .returning({ id: schema.projects.id });
    return deleted ? ("deleted" as const) : ("active_run" as const);
  });

  if (outcome === "active_run") {
    // Deleting the project cascades its run and nulls ledger run IDs, which
    // would make an in-flight provider claim impossible to reconcile.
    throw new Error("Stop the current generation run before deleting this project");
  }
  if (outcome === "open_billing") {
    throw new Error(
      "Wait for pending generation charges to reconcile before deleting this project",
    );
  }
  if (outcome === "not_found") throw new Error("Project not found");
  revalidatePath("/studio");
  redirect("/studio");
}

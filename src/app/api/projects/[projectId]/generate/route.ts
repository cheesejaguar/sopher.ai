import { start, getRun } from "workflow/api";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { getOrCreateBook } from "@/db/queries/projects";
import { generateBook } from "@/workflows/generate-book";
import {
  latestResumableRunId,
  rebaseGenerationStartState,
  type GenerationConfig,
} from "@/lib/run-events";
import { chapterTopologyFingerprint, outlineStateFingerprint } from "@/lib/manuscript-state";
import {
  insertQueuedAuthoringRun,
  scheduleRunReservationCleanup,
  terminalizeAuthoringRun,
} from "@/lib/generation-runs";

export const maxDuration = 60;

const bodySchema = z.object({
  tier: z.enum(["draft", "standard", "premium"]).default("standard"),
  requireOutlineApproval: z.boolean().default(false),
});

function buildBaseGenerationConfig(input: {
  project: typeof schema.projects.$inferSelect;
  tier: GenerationConfig["tier"];
  requireOutlineApproval: boolean;
  chapterRows: Parameters<typeof chapterTopologyFingerprint>[0];
  latestOutline: Parameters<typeof outlineStateFingerprint>[0];
}): GenerationConfig {
  const { project } = input;
  return {
    tier: input.tier,
    requireOutlineApproval: input.requireOutlineApproval,
    waveSize: 4,
    targetChapters: project.targetChapters,
    targetWordsPerChapter: project.targetWordsPerChapter,
    inputSnapshot: {
      brief: project.brief ?? "",
      genre: project.genre ?? null,
      styleGuide: project.styleGuide ?? null,
      voiceProfile: project.settings.voiceProfile ?? null,
      pov: project.settings.pov ?? null,
      tense: project.settings.tense ?? null,
      tone: project.settings.tone ?? null,
      styleProfile: project.settings.styleProfile ?? null,
      heatLevel: project.settings.heatLevel ?? null,
      violenceLevel: project.settings.violenceLevel ?? null,
      profanity: project.settings.profanity ?? null,
      avoidTopics: [...(project.settings.avoidTopics ?? [])],
    },
    chapterTopologyFingerprint: chapterTopologyFingerprint(input.chapterRows),
    liveOutlineFingerprint: outlineStateFingerprint(input.latestOutline),
  };
}

/** Postgres unique violation on uq_runs_active_per_project, possibly wrapped by the driver. */
function isActiveRunConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message, cause } = error as { code?: string; message?: string; cause?: unknown };
  if (code === "23505" || message?.includes("uq_runs_active_per_project")) return true;
  return cause !== undefined && isActiveRunConflict(cause);
}

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }

  try {
    await assertNotSuspended(userId);
  } catch (error) {
    if (error instanceof SuspendedError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  // Bound repeated paid-work requests before the workflow's serialized holds.
  const limited = await rateLimit(LIMITS.bookStart, req, userId);
  if (limited.limited) return limited.response;
  const { projectId } = await ctx.params;
  if (!z.uuid().safeParse(projectId).success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const [activeRun] = await db
    .select({
      id: schema.generationRuns.id,
      kind: schema.generationRuns.kind,
      status: schema.generationRuns.status,
      config: schema.generationRuns.config,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
        ne(schema.generationRuns.kind, "export"),
      ),
    )
    .limit(1);
  if (activeRun) {
    return Response.json(
      {
        error: "A generation run is already in progress",
        runId: activeRun.id,
        kind: activeRun.kind,
        status: activeRun.status,
        ...(activeRun.kind === "full_book" ? { config: activeRun.config } : {}),
      },
      { status: 409 },
    );
  }

  const book = await getOrCreateBook(project.id, project.title);
  const chapterRows = await db
    .select({
      id: schema.chapters.id,
      chapterNumber: schema.chapters.chapterNumber,
      title: schema.chapters.title,
      summary: schema.chapters.summary,
      content: schema.chapters.content,
      status: schema.chapters.status,
      wordCount: schema.chapters.wordCount,
    })
    .from(schema.chapters)
    .where(eq(schema.chapters.bookId, book.id));

  const [latestOutline] = await db
    .select({
      id: schema.outlines.id,
      version: schema.outlines.version,
      source: schema.outlines.source,
      content: schema.outlines.content,
    })
    .from(schema.outlines)
    .where(eq(schema.outlines.bookId, book.id))
    .orderBy(desc(schema.outlines.version))
    .limit(1);

  const baseConfig = buildBaseGenerationConfig({
    project,
    tier: parsed.data.tier,
    requireOutlineApproval: parsed.data.requireOutlineApproval,
    chapterRows,
    latestOutline,
  });
  const priorRuns = await db
    .select({
      id: schema.generationRuns.id,
      status: schema.generationRuns.status,
      config: schema.generationRuns.config,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.kind, "full_book"),
      ),
    )
    .orderBy(desc(schema.generationRuns.createdAt));
  const resumeFromRunId = latestResumableRunId(
    baseConfig,
    priorRuns.map((priorRun) => ({
      ...priorRun,
      config: priorRun.config as Partial<GenerationConfig>,
    })),
  );
  let config: GenerationConfig = {
    ...baseConfig,
    ...(resumeFromRunId ? { resumeFromRunId } : {}),
    ...(resumeFromRunId
      ? {
          billingLineageRunId:
            (
              priorRuns.find((priorRun) => priorRun.id === resumeFromRunId)?.config as
                Partial<GenerationConfig> | undefined
            )?.billingLineageRunId ?? resumeFromRunId,
        }
      : {}),
  };

  let run: { id: string };
  try {
    run = await insertQueuedAuthoringRun({
      projectId,
      userId,
      kind: "full_book",
      config,
    });
  } catch (error) {
    // The partial unique index is the race-proof backstop behind the pre-check above.
    if (!isActiveRunConflict(error)) throw error;
    const [raced] = await db
      .select({
        id: schema.generationRuns.id,
        kind: schema.generationRuns.kind,
        status: schema.generationRuns.status,
        config: schema.generationRuns.config,
      })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.projectId, projectId),
          inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
          ne(schema.generationRuns.kind, "export"),
        ),
      )
      .limit(1);
    return Response.json(
      {
        error: "A generation run is already in progress",
        runId: raced?.id,
        kind: raced?.kind,
        status: raced?.status,
        ...(raced?.kind === "full_book" ? { config: raced.config } : {}),
      },
      { status: 409 },
    );
  }

  let workflowRun: Awaited<ReturnType<typeof start>> | undefined;
  let startAttempted = false;
  try {
    const [[lockedProject], lockedChapterRows, [lockedLatestOutline]] = await Promise.all([
      db
        .select()
        .from(schema.projects)
        .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
        .limit(1),
      db
        .select({
          id: schema.chapters.id,
          chapterNumber: schema.chapters.chapterNumber,
          title: schema.chapters.title,
          summary: schema.chapters.summary,
          content: schema.chapters.content,
          status: schema.chapters.status,
          wordCount: schema.chapters.wordCount,
        })
        .from(schema.chapters)
        .where(eq(schema.chapters.bookId, book.id)),
      db
        .select({
          id: schema.outlines.id,
          version: schema.outlines.version,
          source: schema.outlines.source,
          content: schema.outlines.content,
        })
        .from(schema.outlines)
        .where(eq(schema.outlines.bookId, book.id))
        .orderBy(desc(schema.outlines.version))
        .limit(1),
    ]);
    if (!lockedProject) {
      throw new Error("Project disappeared while generation was starting");
    }
    const lockedBaseConfig = buildBaseGenerationConfig({
      project: lockedProject,
      tier: parsed.data.tier,
      requireOutlineApproval: parsed.data.requireOutlineApproval,
      chapterRows: lockedChapterRows,
      latestOutline: lockedLatestOutline,
    });
    const rebasedConfig = rebaseGenerationStartState(config, lockedBaseConfig);
    if (rebasedConfig !== config) {
      // A structural edit committed after the optimistic snapshot but before
      // the advisory-locked run insert. The queued run now blocks more edits;
      // rebase it to the exact live state and deliberately drop stale lineage.
      config = rebasedConfig;
      await db
        .update(schema.generationRuns)
        .set({ config })
        .where(eq(schema.generationRuns.id, run.id));
    }

    startAttempted = true;
    workflowRun = await start(generateBook, [run.id, projectId, userId, config]);
    await db
      .update(schema.generationRuns)
      .set({ workflowRunId: workflowRun.runId })
      .where(eq(schema.generationRuns.id, run.id));
  } catch (error) {
    if (workflowRun) {
      try {
        await getRun(workflowRun.runId).cancel();
      } catch {
        // Terminal DB state and delayed reservation reconciliation still run.
      }
    }
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId,
      userId,
      status: "failed",
      error: error instanceof Error ? error.message : "Could not start generation",
      releaseImmediately: !startAttempted,
    });
    if (startAttempted) {
      await scheduleRunReservationCleanup({ userId, runId: run.id });
    }
    return Response.json({ error: "Could not start generation" }, { status: 503 });
  }

  return Response.json({ runId: run.id, config }, { status: 202 });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }
  const { projectId } = await ctx.params;
  if (!z.uuid().safeParse(projectId).success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.userId, userId),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
        ne(schema.generationRuns.kind, "export"),
      ),
    )
    .limit(1);
  if (!run) return Response.json({ error: "No active run" }, { status: 404 });

  if (run.workflowRunId) {
    try {
      await getRun(run.workflowRunId).cancel();
    } catch {
      // The workflow may already be terminal. DB state remains authoritative.
    }
  }
  await terminalizeAuthoringRun({
    runId: run.id,
    projectId,
    userId,
    status: "cancelled",
    error: "Cancelled by author",
  });
  await scheduleRunReservationCleanup({ userId, runId: run.id });

  return Response.json({ cancelled: true });
}

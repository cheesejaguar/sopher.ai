import { start, getRun } from "workflow/api";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { getOrCreateBook } from "@/db/queries/projects";
import { generateBook } from "@/workflows/generate-book";
import { latestResumableRunId, type GenerationConfig } from "@/lib/run-events";
import { chapterTopologyFingerprint, outlineStateFingerprint } from "@/lib/manuscript-state";
import {
  insertQueuedAuthoringRun,
  FullBookStartInsufficientCreditsError,
  linkAuthoringRunWorkflow,
  markAuthoringRunAcceptanceUncertain,
  ProjectStartSnapshotChangedError,
  reconcileBeforeAuthoringRunConflict,
  requestAuthoringRunCancellation,
  RunRequestKeyMismatchError,
  scheduleRunReservationCleanup,
  settleStubbedAuthoringRunHandoff,
  terminalizeAuthoringRun,
  TrialOptionalWorkInProgressError,
} from "@/lib/generation-runs";
import { authorizeProjectSpend } from "@/lib/project-spend-http";
import { TRIAL_STORY_CONFIG } from "@/lib/trial-story";
import { isE2EWorkflowStubEnabled } from "@/lib/e2e-workflow-stub";
import { prepareFullBookRunDispatch } from "@/lib/authoring-dispatch";
import { fullBookRequiredCredits } from "@/lib/full-book-credit-requirement";
import { getAuthoringStartSafetyBlock } from "@/lib/authoring-start-safety";

export const maxDuration = 60;

const bodySchema = z.object({
  requestKey: z.uuid().optional(),
  tier: z.enum(["draft", "standard", "premium"]).default("standard"),
  requireOutlineApproval: z.boolean().default(false),
});

const cancellationBodySchema = z.object({
  runId: z.uuid(),
});

function buildBaseGenerationConfig(input: {
  project: typeof schema.projects.$inferSelect;
  tier: GenerationConfig["tier"];
  requireOutlineApproval: boolean;
  chapterRows: Parameters<typeof chapterTopologyFingerprint>[0];
  latestOutline: Parameters<typeof outlineStateFingerprint>[0];
}): GenerationConfig {
  const { project } = input;
  const trial = project.experience === "trial_short_story";
  return {
    protocolVersion: 2,
    productionMode: project.experience,
    tier: trial ? TRIAL_STORY_CONFIG.tier : input.tier,
    requireOutlineApproval: trial
      ? TRIAL_STORY_CONFIG.requireOutlineApproval
      : input.requireOutlineApproval,
    waveSize: trial ? TRIAL_STORY_CONFIG.waveSize : 4,
    targetChapters: trial ? TRIAL_STORY_CONFIG.targetChapters : project.targetChapters,
    targetWordsPerChapter: trial
      ? TRIAL_STORY_CONFIG.targetWordsPerChapter
      : project.targetWordsPerChapter,
    inputSnapshot: {
      workingTitle: project.title,
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

  const requestKey = parsed.data.requestKey ?? crypto.randomUUID();
  const [requestedRun] = await db
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
        eq(schema.generationRuns.userId, userId),
        eq(schema.generationRuns.requestKey, requestKey),
      ),
    )
    .limit(1);
  if (requestedRun) {
    if (requestedRun.kind !== "full_book") {
      return Response.json(
        {
          error: "This request key already belongs to a different generation operation",
        },
        { status: 409 },
      );
    }
    return Response.json(
      {
        runId: requestedRun.id,
        kind: requestedRun.kind,
        status: requestedRun.status,
        reattached: true,
        requestKey,
        config: requestedRun.config,
      },
      { status: 202 },
    );
  }

  await reconcileBeforeAuthoringRunConflict({ projectId, userId });
  const safetyBlock = await getAuthoringStartSafetyBlock({ projectId, userId });
  if (safetyBlock) {
    return Response.json(
      {
        error: "This project needs a safety recheck before another authoring run can be created.",
        ...safetyBlock,
      },
      { status: 409 },
    );
  }

  const spendDenied = await authorizeProjectSpend({
    userId,
    projectId,
    operationKind: "whole_story_start",
  });
  if (spendDenied) return spendDenied;

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

  // Replays above are never rate limited: returning an already-created durable
  // run is read-only. Only a genuinely new paid-work request consumes this
  // rate-limit slot.
  const limited = await rateLimit(LIMITS.bookStart, req, userId);
  if (limited.limited) return limited.response;

  const minimumBalanceCredits =
    project.experience === "full_book"
      ? fullBookRequiredCredits({
          tier: parsed.data.tier,
          targetChapters: project.targetChapters,
          targetWordsPerChapter: project.targetWordsPerChapter,
        })
      : undefined;
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

  let run: Awaited<ReturnType<typeof insertQueuedAuthoringRun>>;
  try {
    run = await insertQueuedAuthoringRun({
      projectId,
      userId,
      kind: "full_book",
      config,
      requestKey,
      expectedProjectSnapshot: {
        updatedAt: project.updatedAt,
        targetChapters: project.targetChapters,
        targetWordsPerChapter: project.targetWordsPerChapter,
        experience: project.experience,
      },
      ...(minimumBalanceCredits !== undefined ? { minimumBalanceCredits } : {}),
    });
    if (!run.inserted) {
      return Response.json(
        {
          runId: run.id,
          kind: "full_book",
          status: run.status,
          reattached: true,
          requestKey,
          config: run.config,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    if (error instanceof RunRequestKeyMismatchError) {
      return Response.json(
        {
          error: "This request key already belongs to a different generation operation",
        },
        { status: 409 },
      );
    }
    if (error instanceof ProjectStartSnapshotChangedError) {
      return Response.json(
        {
          error:
            "Your book setup changed before production started. Review the refreshed estimate and try again.",
          code: "setup_changed",
          retryable: true,
        },
        { status: 409 },
      );
    }
    if (error instanceof TrialOptionalWorkInProgressError) {
      return Response.json({ error: error.message, code: "trial_busy" }, { status: 409 });
    }
    if (error instanceof FullBookStartInsufficientCreditsError) {
      return Response.json(
        {
          error: `${error.balance.toFixed(2)} credits available; ${error.required.toFixed(2)} needed to begin.`,
          code: "insufficient_credits",
          balance: error.balance,
          required: error.required,
          action: {
            kind: "add_credits",
            href: `/studio/credits?return=${encodeURIComponent(`/projects/${projectId}/write`)}&needed=${encodeURIComponent(String(error.required - error.balance))}`,
          },
        },
        { status: 402 },
      );
    }
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

  try {
    const prepared = await prepareFullBookRunDispatch({ runId: run.id, projectId, userId });
    if (!prepared) throw new Error("Generation settings could not be frozen");
    config = prepared;

    if (isE2EWorkflowStubEnabled()) {
      await settleStubbedAuthoringRunHandoff({ runId: run.id, projectId, userId });
      return Response.json({ runId: run.id, requestKey, config, stubbed: true }, { status: 202 });
    }
  } catch (error) {
    // No Workflow invocation has happened yet, so this failure is proven
    // local and can safely terminalize the queued row.
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId,
      userId,
      status: "failed",
      error: error instanceof Error ? error.message : "Could not start generation",
      releaseImmediately: true,
    });
    return Response.json({ error: "Could not start generation" }, { status: 503 });
  }

  try {
    const workflowRun = await start(generateBook, [run.id, projectId, userId, config]);
    try {
      await linkAuthoringRunWorkflow({
        runId: run.id,
        projectId,
        userId,
        workflowRunId: workflowRun.runId,
      });
    } catch (error) {
      // generateBook self-links from getWorkflowMetadata() before paid work.
      // A failed redundant write must not cancel an accepted workflow.
      console.error("Workflow accepted before caller-side linkage persisted", {
        runId: run.id,
        workflowRunId: workflowRun.runId,
        error,
      });
    }
  } catch {
    // `start()` may have accepted the Workflow before its response was lost.
    // Keep the DB run active and let self-link/reconciliation prove the
    // outcome; terminalizing here could kill paid work already in flight.
    const uncertain = await markAuthoringRunAcceptanceUncertain({
      runId: run.id,
      projectId,
      userId,
    });
    return Response.json(
      {
        runId: run.id,
        requestKey,
        config,
        confirmationPending: uncertain,
      },
      { status: 202 },
    );
  }

  return Response.json({ runId: run.id, requestKey, config }, { status: 202 });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
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
  const body = cancellationBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "A valid run ID is required" }, { status: 400 });
  }

  const cancellation = await requestAuthoringRunCancellation({
    runId: body.data.runId,
    projectId,
    userId,
    reason: "Cancelled by author",
  });
  if (!cancellation?.requested) {
    return Response.json(
      {
        error: "This run is no longer the active authoring run. Refresh before stopping work.",
        code: "stale_run",
      },
      { status: 409 },
    );
  }

  if (cancellation.workflowRunId) {
    try {
      await getRun(cancellation.workflowRunId).cancel();
    } catch (error) {
      console.warn("Could not immediately forward authoring cancellation", {
        runId: cancellation.runId,
        workflowRunId: cancellation.workflowRunId,
        error,
      });
    }
  }
  await scheduleRunReservationCleanup({ userId, runId: cancellation.runId });

  return Response.json({ cancelled: false, cancellationRequested: true });
}

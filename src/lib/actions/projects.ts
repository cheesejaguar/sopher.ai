"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { start } from "workflow/api";
import { z } from "zod";
import { getDb, schema, withDbTransaction } from "@/db";
import { assertNotSuspended, requireUser, SuspendedError } from "@/lib/auth";
import { canonicalizeCreditRequirement, creditsForUsd, getBalance } from "@/lib/billing/credits";
import { isActionRateLimited, LIMITS } from "@/lib/security/rate-limit";
import { getOrCreateBook } from "@/db/queries/projects";
import { generateBook } from "@/workflows/generate-book";
import { isActiveRunConflict } from "@/lib/run-conflict";
import {
  buildBookGenerationConfig,
  canReattachBookStart,
  type StartableProject,
} from "@/lib/book-start";
import { isE2EWorkflowStubEnabled } from "@/lib/e2e-workflow-stub";
import { prepareFullBookRunDispatch } from "@/lib/authoring-dispatch";
import {
  insertQueuedAuthoringRun,
  linkAuthoringRunWorkflow,
  markAuthoringRunAcceptanceUncertain,
  reconcileBeforeAuthoringRunConflict,
  RunRequestKeyMismatchError,
  settleStubbedAuthoringRunHandoff,
  terminalizeAuthoringRun,
  TrialOptionalWorkInProgressError,
} from "@/lib/generation-runs";
import type { GenerationConfig } from "@/lib/run-events";
import { getStudioAccess } from "@/lib/studio-access";
import { TRIAL_STORY_CONFIG, type ProjectExperience } from "@/lib/trial-story";
import {
  deleteProjectTransaction,
  refreshProjectBeforeFirstRunTransaction,
  updateProjectTransaction,
} from "@/lib/project-transaction-operations";
import {
  createProjectSchema,
  projectBriefSchema,
  projectGenreSchema,
  projectSettingsSchema,
  projectTitleSchema,
  updateProjectSchema,
} from "@/lib/validation/project";
import { freshOpeningRequiredUsd } from "@/workflows/opening-credit-plan";

export async function createProject(input: unknown) {
  const { userId } = await requireUser();
  const data = createProjectSchema.parse(input);
  const access = await getStudioAccess(userId);
  if (!access.creationExperience) {
    throw new Error(
      access.reason === "verify_email"
        ? "Verify your email address to create the included short story"
        : "Purchase credits to start another book",
    );
  }
  const trial = access.creationExperience === "trial_short_story";

  const db = getDb();
  const [project] = await db
    .insert(schema.projects)
    .values({
      userId,
      title: data.title,
      brief: data.brief,
      genre: data.genre,
      experience: access.creationExperience,
      targetChapters: trial ? TRIAL_STORY_CONFIG.targetChapters : data.targetChapters,
      targetWordsPerChapter: trial
        ? TRIAL_STORY_CONFIG.targetWordsPerChapter
        : data.targetWordsPerChapter,
      styleGuide: data.styleGuide,
      settings: {
        ...data.settings,
        ...(trial
          ? {
              qualityTier: TRIAL_STORY_CONFIG.tier,
              requireOutlineApproval: TRIAL_STORY_CONFIG.requireOutlineApproval,
            }
          : {}),
      },
    })
    .returning();

  revalidatePath("/studio");
  redirect(`/projects/${project.id}/brief`);
}

const startBookSchema = z.object({
  requestKey: z.uuid(),
  /** Test-only failure injection, rejected unless the isolated E2E gate is active. */
  e2eStartMode: z.enum(["fail_before_work"]).optional(),
  /** Advisory only; the server derives the actual entitlement. */
  experience: z.enum(["trial_short_story", "full_book"]).optional(),
  title: projectTitleSchema,
  brief: projectBriefSchema,
  genre: projectGenreSchema,
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

type StartBookInput = z.infer<typeof startBookSchema>;

type StartBookFieldErrors = Record<string, string[] | undefined>;

export type StartBookResult =
  | {
      status: "accepted" | "reattached";
      projectId: string;
      runId: string;
      experience: ProjectExperience;
    }
  | {
      status: "validation_error";
      message: string;
      fieldErrors?: StartBookFieldErrors;
      code?: "email_verification_required" | "purchase_required";
    }
  | {
      status: "insufficient_credits";
      message: string;
      balance: number;
      required: number;
    }
  | {
      status: "rate_limited" | "suspended";
      message: string;
    }
  | {
      status: "start_failed";
      projectId: string;
      runId?: string;
      message: string;
      noWorkStarted: boolean;
    };

async function existingStartResult(input: {
  projectId: string;
  userId: string;
  requestKey: string;
  experience: ProjectExperience;
}): Promise<StartBookResult | null> {
  const db = getDb();
  const [run] = await db
    .select({
      id: schema.generationRuns.id,
      kind: schema.generationRuns.kind,
      status: schema.generationRuns.status,
      workflowRunId: schema.generationRuns.workflowRunId,
      acceptanceUncertainAt: schema.generationRuns.acceptanceUncertainAt,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, input.projectId),
        eq(schema.generationRuns.userId, input.userId),
        eq(schema.generationRuns.requestKey, input.requestKey),
      ),
    )
    .limit(1);
  if (!run) return null;
  if (run.kind !== "full_book") {
    return {
      status: "validation_error",
      message: "This start request belongs to a different generation operation.",
    };
  }

  if (run.status === "failed" || run.status === "cancelled") {
    const [[eventFacts], [callFacts], [ledgerFacts]] = await Promise.all([
      db
        .select({
          authoringCount: sql<number>`count(*) filter (
            where ${schema.generationEvents.type} in ('agent', 'chapter', 'review')
              or (
                ${schema.generationEvents.type} = 'stage'
                and ${schema.generationEvents.payload}->>'stage' <> 'queued'
              )
          )::int`,
        })
        .from(schema.generationEvents)
        .where(eq(schema.generationEvents.runId, run.id)),
      db
        .select({
          count: sql<number>`count(*)::int`,
          meteredUsd: sql<string>`coalesce(sum(${schema.llmCalls.usd}), 0)`,
        })
        .from(schema.llmCalls)
        .where(eq(schema.llmCalls.runId, run.id)),
      db
        .select({
          reservationCount: sql<number>`count(*) filter (
            where coalesce(${schema.creditLedger.externalRef}, '')
              ~ '^(generation-reservation:|interactive-reservation:)'
          )::int`,
          creditsUsed: sql<string>`coalesce(
            -sum(${schema.creditLedger.amount}) filter (
              where ${schema.creditLedger.kind} = 'usage'
            ),
            0
          )`,
        })
        .from(schema.creditLedger)
        .where(eq(schema.creditLedger.runId, run.id)),
    ]);
    const noWorkStarted =
      (eventFacts?.authoringCount ?? 0) === 0 &&
      (callFacts?.count ?? 0) === 0 &&
      Number(callFacts?.meteredUsd ?? 0) === 0 &&
      (ledgerFacts?.reservationCount ?? 0) === 0 &&
      Number(ledgerFacts?.creditsUsed ?? 0) === 0;
    return {
      status: "start_failed",
      projectId: input.projectId,
      runId: run.id,
      message: noWorkStarted
        ? "Writing didn’t begin. No credits were used."
        : "Production stopped before the story was complete.",
      noWorkStarted,
    };
  }

  if (run.status === "queued" && !run.workflowRunId) {
    return {
      status: "start_failed",
      projectId: input.projectId,
      runId: run.id,
      message: run.acceptanceUncertainAt
        ? "Production acceptance is still being confirmed. Open Write to continue safely."
        : "Production has not been confirmed yet. Open Write to continue safely.",
      noWorkStarted: false,
    };
  }

  return {
    status: "reattached",
    projectId: input.projectId,
    runId: run.id,
    experience: input.experience,
  };
}

function projectStartValues(data: StartBookInput, experience: ProjectExperience) {
  const trial = experience === "trial_short_story";
  return {
    title: data.title,
    brief: data.brief,
    genre: data.genre,
    subgenre: data.subgenre ?? null,
    protagonist: data.protagonist ?? null,
    setting: data.setting ?? null,
    experience,
    targetChapters: trial ? TRIAL_STORY_CONFIG.targetChapters : data.targetChapters,
    targetWordsPerChapter: trial
      ? TRIAL_STORY_CONFIG.targetWordsPerChapter
      : data.targetWordsPerChapter,
    settings: {
      ...data.settings,
      ...(trial
        ? {
            qualityTier: TRIAL_STORY_CONFIG.tier,
            requireOutlineApproval: TRIAL_STORY_CONFIG.requireOutlineApproval,
          }
        : {}),
    },
  } satisfies Partial<typeof schema.projects.$inferInsert>;
}

async function refreshSameKeyProjectBeforeFirstRun(input: {
  project: typeof schema.projects.$inferSelect;
  userId: string;
  data: StartBookInput;
}): Promise<typeof schema.projects.$inferSelect> {
  return withDbTransaction((tx) =>
    refreshProjectBeforeFirstRunTransaction(tx, {
      project: input.project,
      userId: input.userId,
      values: projectStartValues(input.data, input.project.experience),
    }),
  );
}

/**
 * Shared run-start logic — the server-side equivalent of
 * POST /api/projects/[projectId]/generate, factored out so server actions
 * never HTTP back into their own deployment.
 */
async function startGenerationRun(
  project: StartableProject,
  userId: string,
  config: GenerationConfig,
  requestKey: string,
  e2eStartMode?: "fail_before_work",
): Promise<StartBookResult> {
  const db = getDb();

  await reconcileBeforeAuthoringRunConflict({ projectId: project.id, userId });
  const replay = await existingStartResult({
    projectId: project.id,
    userId,
    requestKey,
    experience: project.experience,
  });
  if (replay) return replay;

  const [activeRun] = await db
    .select({
      id: schema.generationRuns.id,
      kind: schema.generationRuns.kind,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, project.id),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
      ),
    )
    .limit(1);
  if (activeRun) {
    if (!canReattachBookStart(activeRun.kind)) {
      return {
        status: "rate_limited",
        message:
          "Another writing task is still running for this project. Let it finish before starting the book.",
      };
    }
    return {
      status: "reattached",
      projectId: project.id,
      runId: activeRun.id,
      experience: project.experience,
    };
  }

  await getOrCreateBook(project.id, project.title);

  let run: Awaited<ReturnType<typeof insertQueuedAuthoringRun>>;
  try {
    run = await insertQueuedAuthoringRun({
      projectId: project.id,
      userId,
      kind: "full_book",
      config,
      requestKey,
    });
  } catch (error) {
    if (error instanceof RunRequestKeyMismatchError) {
      return {
        status: "start_failed",
        projectId: project.id,
        message: "This start request conflicts with a different generation operation.",
        noWorkStarted: false,
      };
    }
    if (error instanceof TrialOptionalWorkInProgressError) {
      return {
        status: "start_failed",
        projectId: project.id,
        message: error.message,
        noWorkStarted: false,
      };
    }
    // The partial unique index is the race-proof backstop behind the pre-check above.
    if (!isActiveRunConflict(error)) throw error;
    const [raced] = await db
      .select({
        id: schema.generationRuns.id,
        kind: schema.generationRuns.kind,
      })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.projectId, project.id),
          inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
        ),
      )
      .limit(1);
    if (!raced) throw error;
    if (!canReattachBookStart(raced.kind)) {
      return {
        status: "rate_limited",
        message:
          "Another writing task is still running for this project. Let it finish before starting the book.",
      };
    }
    return {
      status: "reattached",
      projectId: project.id,
      runId: raced.id,
      experience: project.experience,
    };
  }

  if (!run.inserted) {
    const existing = await existingStartResult({
      projectId: project.id,
      userId,
      requestKey,
      experience: project.experience,
    });
    if (existing) return existing;
    throw new Error("Could not recover the existing generation request");
  }

  const dispatchConfig = await prepareFullBookRunDispatch({
    runId: run.id,
    projectId: project.id,
    userId,
  });
  if (!dispatchConfig) {
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: project.id,
      userId,
      status: "failed",
      error: "Generation settings could not be frozen before Workflow dispatch",
      releaseImmediately: true,
    });
    return {
      status: "start_failed",
      projectId: project.id,
      runId: run.id,
      message: "Writing didn’t begin. No credits were used.",
      noWorkStarted: true,
    };
  }

  if (isE2EWorkflowStubEnabled()) {
    if (e2eStartMode === "fail_before_work") {
      await terminalizeAuthoringRun({
        runId: run.id,
        projectId: project.id,
        userId,
        status: "failed",
        error: "Isolated E2E startup failure",
        releaseImmediately: true,
      });
      return {
        status: "start_failed",
        projectId: project.id,
        runId: run.id,
        message: "Writing didn’t begin. No credits were used.",
        noWorkStarted: true,
      };
    }
    await settleStubbedAuthoringRunHandoff({
      runId: run.id,
      projectId: project.id,
      userId,
    });
    return {
      status: "accepted",
      projectId: project.id,
      runId: run.id,
      experience: project.experience,
    };
  }

  try {
    const workflowRun = await start(generateBook, [run.id, project.id, userId, dispatchConfig]);
    try {
      await linkAuthoringRunWorkflow({
        runId: run.id,
        projectId: project.id,
        userId,
        workflowRunId: workflowRun.runId,
      });
    } catch (error) {
      // generateBook self-links from getWorkflowMetadata() before paid work.
      // The accepted workflow must not be cancelled because this redundant
      // caller-side write lost its connection.
      console.error("Workflow accepted before caller-side linkage persisted", {
        runId: run.id,
        workflowRunId: workflowRun.runId,
        error,
      });
    }
  } catch {
    const uncertain = await markAuthoringRunAcceptanceUncertain({
      runId: run.id,
      projectId: project.id,
      userId,
    });
    if (!uncertain) {
      // The Workflow may already have self-linked while the caller was
      // handling its lost response. Re-read through the idempotent boundary
      // rather than overwriting or terminalizing that accepted run.
      const recovered = await existingStartResult({
        projectId: project.id,
        userId,
        requestKey,
        experience: project.experience,
      });
      if (recovered) return recovered;
    }
    return {
      status: "start_failed",
      projectId: project.id,
      runId: run.id,
      message:
        "Production could not be confirmed. Open Write to check the run before trying again.",
      noWorkStarted: false,
    };
  }

  return {
    status: "accepted",
    projectId: project.id,
    runId: run.id,
    experience: project.experience,
  };
}

/**
 * The wizard's submit: creates the project and immediately starts the
 * full-book generation workflow, then lands the author on the Write stage.
 */
export async function startBook(input: unknown): Promise<StartBookResult> {
  const { userId } = await requireUser();
  // Server-action throw messages are redacted in production, so suspension is
  // returned as data — the wizard shows it verbatim.
  try {
    await assertNotSuspended(userId);
  } catch (error) {
    if (error instanceof SuspendedError) {
      return { status: "suspended", message: error.message };
    }
    return {
      status: "validation_error",
      message: "Studio access could not be confirmed. Your setup is saved; please try again.",
    };
  }
  const parsed = startBookSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "validation_error",
      message: "Check the highlighted setup fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  if (data.e2eStartMode && !isE2EWorkflowStubEnabled()) {
    return {
      status: "validation_error",
      message: "This start mode is available only in isolated browser tests.",
      fieldErrors: { e2eStartMode: ["Unavailable outside isolated browser tests"] },
    };
  }

  try {
    return await startBookParsed(userId, data);
  } catch (error) {
    return recoverStartBookFailure({
      userId,
      requestKey: data.requestKey,
      error,
    });
  }
}

async function startBookParsed(userId: string, data: StartBookInput): Promise<StartBookResult> {
  const db = getDb();

  const [sameProject] = await db
    .select()
    .from(schema.projects)
    .where(
      and(eq(schema.projects.userId, userId), eq(schema.projects.creationKey, data.requestKey)),
    )
    .limit(1);

  let project = sameProject;
  let experience: ProjectExperience;
  if (project) {
    experience = project.experience;
    await reconcileBeforeAuthoringRunConflict({
      projectId: project.id,
      userId,
    });
    const replay = await existingStartResult({
      projectId: project.id,
      userId,
      requestKey: data.requestKey,
      experience,
    });
    if (replay) return replay;
    project = await refreshSameKeyProjectBeforeFirstRun({
      project,
      userId,
      data,
    });
  } else {
    const access = await getStudioAccess(userId);
    if (!access.creationExperience) {
      const needsVerification = access.reason === "verify_email";
      return {
        status: "validation_error",
        code: needsVerification ? "email_verification_required" : "purchase_required",
        message: needsVerification
          ? "Verify your email address to create the included short story."
          : "Your included story is already in Studio. Purchase credits to start another book.",
      };
    }
    experience = access.creationExperience;
  }

  // The other entry point to a full book run (POST /api/projects/[id]/generate)
  // is rate limited; this one is the wizard's submit and needs the same bound,
  // since each run is the single most expensive thing a user can trigger.
  if (await isActionRateLimited(LIMITS.bookStart, userId)) {
    return {
      status: "rate_limited",
      message: "Too many books started at once — give it a moment and try again.",
    };
  }

  if (!project) {
    const [inserted] = await db
      .insert(schema.projects)
      .values({
        userId,
        creationKey: data.requestKey,
        ...projectStartValues(data, experience),
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      project = inserted;
    } else {
      const [racedProject] = await db
        .select()
        .from(schema.projects)
        .where(
          and(eq(schema.projects.userId, userId), eq(schema.projects.creationKey, data.requestKey)),
        )
        .limit(1);
      if (racedProject) {
        project = racedProject;
        experience = racedProject.experience;
      } else {
        return {
          status: "validation_error",
          code: "purchase_required",
          message:
            "Your included story is already in Studio. Purchase credits to start another book.",
        };
      }
    }
  }

  const config = buildBookGenerationConfig(project);

  const required = canonicalizeCreditRequirement(creditsForUsd(freshOpeningRequiredUsd(config)));
  const balance = await getBalance(userId);
  if (balance < required) {
    revalidatePath("/studio");
    return {
      status: "insufficient_credits",
      message: `${balance.toFixed(2)} credits available; ${required.toFixed(2)} needed to begin.`,
      balance,
      required,
    };
  }

  const result = await startGenerationRun(
    project,
    userId,
    config,
    data.requestKey,
    data.e2eStartMode,
  );

  revalidatePath("/studio");
  return result;
}

async function recoverStartBookFailure(input: {
  userId: string;
  requestKey: string;
  error: unknown;
}): Promise<StartBookResult> {
  console.error("Book start did not return a durable outcome", {
    userId: input.userId,
    requestKey: input.requestKey,
    error: input.error,
  });

  try {
    const [project] = await getDb()
      .select({
        id: schema.projects.id,
        experience: schema.projects.experience,
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.userId, input.userId),
          eq(schema.projects.creationKey, input.requestKey),
        ),
      )
      .limit(1);
    if (project) {
      try {
        const replay = await existingStartResult({
          projectId: project.id,
          userId: input.userId,
          requestKey: input.requestKey,
          experience: project.experience,
        });
        if (replay) return replay;
      } catch {
        // The project handoff below remains truthful even when health lookup
        // is temporarily unavailable.
      }
      return {
        status: "start_failed",
        projectId: project.id,
        message:
          "Your setup was saved, but production status could not be confirmed. Open Write to continue safely.",
        noWorkStarted: false,
      };
    }
  } catch {
    // With no confirmed durable project, keep the author in the saved wizard.
  }

  return {
    status: "validation_error",
    message: "The book could not be saved right now. Your setup is preserved; please try again.",
  };
}

export async function updateProject(projectId: string, input: unknown) {
  const { userId } = await requireUser();
  const data = updateProjectSchema.parse(input);

  await reconcileBeforeAuthoringRunConflict({ projectId, userId });
  // The lock is shared with run insertion and outline mutation. Because it is
  // acquired before the reads and mirrored rename, generation cannot observe
  // two different manuscript identities.
  const outcome = await withDbTransaction((tx) =>
    updateProjectTransaction(tx, { projectId, userId, data }),
  );

  if (outcome === "not_found") throw new Error("Project not found");
  if (outcome === "trial_shape") {
    throw new Error("The included story uses a fixed 3 chapter, 1,000 word production shape");
  }
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
  await reconcileBeforeAuthoringRunConflict({ projectId, userId });
  const outcome = await withDbTransaction((tx) =>
    deleteProjectTransaction(tx, {
      projectId,
      userId,
      // Start durable cleanup before the project cascade. A rollback leaves
      // the project visible, so the delayed workflow safely no-ops.
      scheduleCleanup: async (id, pathnames) => {
        const [{ start }, { cleanupProjectBlobsAfterDelete }] = await Promise.all([
          import("workflow/api"),
          import("@/workflows/cleanup-project-blobs"),
        ]);
        await start(cleanupProjectBlobsAfterDelete, [id, pathnames]);
      },
    }),
  );

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

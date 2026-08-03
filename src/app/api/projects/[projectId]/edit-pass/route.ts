import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { start } from "workflow/api";

import { getDb, schema } from "@/db";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { isE2EWorkflowStubEnabled } from "@/lib/e2e-workflow-stub";
import {
  FullBookStartInsufficientCreditsError,
  insertQueuedAuthoringRun,
  linkAuthoringRunWorkflow,
  markAuthoringRunAcceptanceUncertain,
  RunRequestKeyMismatchError,
  settleStubbedAuthoringRunHandoff,
  TrialOptionalWorkInProgressError,
} from "@/lib/generation-runs";
import {
  MANUSCRIPT_EDIT_CHAPTER_MAX_CHARS,
  MANUSCRIPT_EDIT_INSTRUCTION_MAX,
  manuscriptEditMaximumCredits,
  normalizeManuscriptEditInstruction,
  readManuscriptEditPassCompletion,
  type ManuscriptEditPassConfig,
} from "@/lib/manuscript-edit-pass";
import { authorizeProjectSpend } from "@/lib/project-spend-http";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { editManuscript } from "@/workflows/edit-manuscript";

export const maxDuration = 60;

const bodySchema = z.object({
  requestKey: z.uuid(),
  instruction: z
    .string()
    .min(3, "Describe the change you want across the manuscript")
    .max(MANUSCRIPT_EDIT_INSTRUCTION_MAX),
});

async function instructionDigest(instruction: string): Promise<string> {
  const bytes = new TextEncoder().encode(instruction);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

type EditPassRun = Pick<
  typeof schema.generationRuns.$inferSelect,
  | "id"
  | "status"
  | "kind"
  | "config"
  | "workflowRunId"
  | "error"
  | "createdAt"
  | "completedAt"
  | "acceptanceUncertainAt"
>;

async function requireProject(userId: string, projectId: string) {
  const [project] = await getDb()
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return project ?? null;
}

async function editPassResult(projectId: string, run: EditPassRun | null) {
  if (!run) return { run: null, suggestionCount: 0, firstSuggestionChapter: null };
  const db = getDb();
  const [[suggestions], [first]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.suggestions)
      .where(and(eq(schema.suggestions.runId, run.id), eq(schema.suggestions.status, "pending"))),
    db
      .select({ chapterNumber: schema.chapters.chapterNumber })
      .from(schema.suggestions)
      .innerJoin(schema.chapters, eq(schema.chapters.id, schema.suggestions.chapterId))
      .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
      .where(
        and(
          eq(schema.suggestions.runId, run.id),
          eq(schema.suggestions.status, "pending"),
          eq(schema.books.projectId, projectId),
        ),
      )
      .orderBy(schema.chapters.chapterNumber)
      .limit(1),
  ]);
  const config = run.config as Partial<ManuscriptEditPassConfig>;
  return {
    run: {
      id: run.id,
      status: run.status,
      error: run.error,
      workflowRunId: run.workflowRunId,
      instruction: config.editPass?.instruction ?? "",
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      confirmationPending: Boolean(run.acceptanceUncertainAt && !run.workflowRunId),
      completion: readManuscriptEditPassCompletion(run.config),
    },
    suggestionCount: Number(suggestions?.count ?? 0),
    firstSuggestionChapter: first?.chapterNumber ?? null,
  };
}

/** Latest whole-manuscript review, including the first actionable suggestion. */
export async function GET(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
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
  if (!(await requireProject(userId, projectId))) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const [run] = await getDb()
    .select({
      id: schema.generationRuns.id,
      status: schema.generationRuns.status,
      kind: schema.generationRuns.kind,
      config: schema.generationRuns.config,
      workflowRunId: schema.generationRuns.workflowRunId,
      error: schema.generationRuns.error,
      createdAt: schema.generationRuns.createdAt,
      completedAt: schema.generationRuns.completedAt,
      acceptanceUncertainAt: schema.generationRuns.acceptanceUncertainAt,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.userId, userId),
        eq(schema.generationRuns.kind, "edit_pass"),
      ),
    )
    .orderBy(desc(schema.generationRuns.createdAt))
    .limit(1);
  return Response.json(await editPassResult(projectId, run ?? null), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Start one idempotent, non-destructive whole-manuscript prompt review. */
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
      return Response.json({ error: error.message, code: "suspended" }, { status: 403 });
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
  const instruction = normalizeManuscriptEditInstruction(parsed.data.instruction);
  if (instruction.length < 3) {
    return Response.json(
      { error: "Describe the change you want across the manuscript" },
      { status: 400 },
    );
  }
  const requestedInstructionDigest = await instructionDigest(instruction);
  const db = getDb();
  const project = await requireProject(userId, projectId);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  // Idempotent replays must attach before optional-spend authorization sees
  // the already-active run and rejects it as a conflict.
  const [replay] = await db
    .select({
      id: schema.generationRuns.id,
      status: schema.generationRuns.status,
      kind: schema.generationRuns.kind,
      config: schema.generationRuns.config,
      workflowRunId: schema.generationRuns.workflowRunId,
      error: schema.generationRuns.error,
      createdAt: schema.generationRuns.createdAt,
      completedAt: schema.generationRuns.completedAt,
      acceptanceUncertainAt: schema.generationRuns.acceptanceUncertainAt,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.userId, userId),
        eq(schema.generationRuns.requestKey, parsed.data.requestKey),
      ),
    )
    .limit(1);
  if (replay) {
    if (replay.kind !== "edit_pass") {
      return Response.json(
        { error: "This request key belongs to a different authoring operation" },
        { status: 409 },
      );
    }
    const replayConfig = replay.config as Partial<ManuscriptEditPassConfig>;
    if (replayConfig.editPass?.instructionDigest !== requestedInstructionDigest) {
      return Response.json(
        {
          error: "This request key belongs to a different manuscript direction. Try again.",
          code: "request_key_reused",
        },
        { status: 409 },
      );
    }
    return Response.json(
      { ...(await editPassResult(projectId, replay)), reattached: true },
      { status: 202 },
    );
  }

  const spendDenied = await authorizeProjectSpend({
    userId,
    projectId,
    operationKind: "optional",
  });
  if (spendDenied) return spendDenied;
  const limited = await rateLimit(LIMITS.llmEdit, req, userId);
  if (limited.limited) return limited.response;

  const chapterRows = await db
    .select({
      id: schema.chapters.id,
      contentLength: sql<number>`length(${schema.chapters.content})::int`,
      wordCount: schema.chapters.wordCount,
    })
    .from(schema.chapters)
    .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
    .where(
      and(
        eq(schema.books.projectId, projectId),
        sql`length(btrim(${schema.chapters.content})) > 0`,
      ),
    );
  if (chapterRows.length === 0) {
    return Response.json(
      { error: "Write at least one chapter before asking for a manuscript-wide edit" },
      { status: 400 },
    );
  }
  const oversized = chapterRows.find(
    (chapter) => chapter.contentLength > MANUSCRIPT_EDIT_CHAPTER_MAX_CHARS,
  );
  if (oversized) {
    return Response.json(
      {
        error:
          "One chapter is too long for a safe single-pass review. Split that chapter, then try again.",
      },
      { status: 413 },
    );
  }

  const tier = project.settings.qualityTier ?? "standard";
  const maximumCredits = manuscriptEditMaximumCredits(tier, chapterRows.length);
  const averageWords = Math.max(
    1,
    Math.round(
      chapterRows.reduce((total, chapter) => total + chapter.wordCount, 0) / chapterRows.length,
    ),
  );
  const config: ManuscriptEditPassConfig = {
    protocolVersion: 3,
    dispatchReady: true,
    tier,
    targetChapters: chapterRows.length,
    targetWordsPerChapter: averageWords,
    requireOutlineApproval: false,
    waveSize: 1,
    editPass: {
      version: 1,
      instruction,
      instructionDigest: requestedInstructionDigest,
    },
  };

  let run: Awaited<ReturnType<typeof insertQueuedAuthoringRun>>;
  try {
    run = await insertQueuedAuthoringRun({
      projectId,
      userId,
      kind: "edit_pass",
      requestKey: parsed.data.requestKey,
      config,
      minimumBalanceCredits: maximumCredits,
    });
  } catch (error) {
    if (error instanceof FullBookStartInsufficientCreditsError) {
      return Response.json(
        {
          error: `${error.balance.toFixed(2)} credits available; up to ${error.required.toFixed(2)} needed for this review.`,
          code: "insufficient_credits",
          balance: error.balance,
          required: error.required,
          action: {
            kind: "add_credits",
            href: `/studio/credits?return=${encodeURIComponent(`/projects/${projectId}/editor`)}&needed=${encodeURIComponent(String(error.required - error.balance))}`,
          },
        },
        { status: 402 },
      );
    }
    if (error instanceof RunRequestKeyMismatchError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof TrialOptionalWorkInProgressError) {
      return Response.json({ error: error.message, code: "trial_busy" }, { status: 409 });
    }
    const [active] = await db
      .select({ id: schema.generationRuns.id, kind: schema.generationRuns.kind })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.projectId, projectId),
          inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
        ),
      )
      .limit(1);
    if (active) {
      return Response.json(
        {
          error: "Finish or stop the current authoring run first",
          runId: active.id,
          kind: active.kind,
        },
        { status: 409 },
      );
    }
    throw error;
  }

  if (!run.inserted) {
    const [existing] = await db
      .select({
        id: schema.generationRuns.id,
        status: schema.generationRuns.status,
        kind: schema.generationRuns.kind,
        config: schema.generationRuns.config,
        workflowRunId: schema.generationRuns.workflowRunId,
        error: schema.generationRuns.error,
        createdAt: schema.generationRuns.createdAt,
        completedAt: schema.generationRuns.completedAt,
        acceptanceUncertainAt: schema.generationRuns.acceptanceUncertainAt,
      })
      .from(schema.generationRuns)
      .where(eq(schema.generationRuns.id, run.id))
      .limit(1);
    return Response.json(
      { ...(await editPassResult(projectId, existing ?? null)), reattached: true },
      { status: 202 },
    );
  }

  if (isE2EWorkflowStubEnabled()) {
    await settleStubbedAuthoringRunHandoff({ runId: run.id, projectId, userId });
    const completedAt = new Date();
    const stubbedConfig: ManuscriptEditPassConfig = {
      ...config,
      editPass: {
        ...config.editPass,
        completion: {
          sourceRunId: run.id,
          reviewedChapterCount: chapterRows.length,
          suggestionCount: 0,
          completedAt: completedAt.toISOString(),
        },
      },
    };
    await db
      .update(schema.generationRuns)
      .set({
        config: stubbedConfig,
        status: "completed",
        currentStage: "done",
        progressPct: 100,
        stageDescription: "Stubbed manuscript review complete",
        completedAt,
        heartbeatAt: completedAt,
      })
      .where(
        and(
          eq(schema.generationRuns.id, run.id),
          eq(schema.generationRuns.projectId, projectId),
          eq(schema.generationRuns.userId, userId),
        ),
      );
    return Response.json(
      {
        run: {
          id: run.id,
          status: "completed",
          instruction,
          completion: stubbedConfig.editPass.completion,
        },
        suggestionCount: 0,
        firstSuggestionChapter: null,
        maximumCredits,
        stubbed: true,
      },
      { status: 202 },
    );
  }

  try {
    const workflowRun = await start(editManuscript, [run.id, projectId, userId, config]);
    try {
      await linkAuthoringRunWorkflow({
        runId: run.id,
        projectId,
        userId,
        workflowRunId: workflowRun.runId,
      });
    } catch (error) {
      console.error("Edit-pass Workflow accepted before caller-side linkage persisted", {
        runId: run.id,
        workflowRunId: workflowRun.runId,
        error,
      });
    }
  } catch {
    const confirmationPending = await markAuthoringRunAcceptanceUncertain({
      runId: run.id,
      projectId,
      userId,
    });
    return Response.json(
      {
        run: { id: run.id, status: "queued", confirmationPending },
        maximumCredits,
      },
      { status: 202 },
    );
  }

  return Response.json({ run: { id: run.id, status: "queued" }, maximumCredits }, { status: 202 });
}

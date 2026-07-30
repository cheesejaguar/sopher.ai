import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getRun } from "workflow/api";

import { estimateBookCost } from "@/ai/estimate";
import type { QualityTier } from "@/ai/models";
import { getDb, schema } from "@/db";
import {
  ACTIVE_AUTHORING_RUN_STATUSES,
  deriveAuthoringRunAcceptanceState,
  terminalizeAuthoringRun,
  transitionAuthoringRunState,
  type AuthoringRunStatus,
} from "@/lib/generation-runs";
import { runEventSchema, type GenerationConfig, type Stage } from "@/lib/run-events";

export type WorkflowHealthStatus =
  "pending" | "running" | "completed" | "failed" | "cancelled" | "missing" | "unavailable";

export type EffectiveRunStatus = AuthoringRunStatus;

export type RunHealth = {
  databaseStatus: AuthoringRunStatus;
  workflowStatus: WorkflowHealthStatus;
  effectiveStatus: EffectiveRunStatus;
  acceptedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  workflowStartedAt: string | null;
  workflowCompletedAt: string | null;
  lastEventAt: string | null;
  lastUpdateAt: string;
  elapsedMs: number;
  estimatedMinutes: number | null;
  stage: Stage;
  progressPct: number;
  stageDescription: string | null;
  chapters: {
    total: number;
    planned: number;
    drafting: number;
    drafted: number;
    edited: number;
    final: number;
  };
  spend: {
    meteredUsd: number;
    creditsUsed: number;
  };
  authoringBegan: boolean;
  noWorkStarted: boolean;
  acceptanceUncertain: boolean;
  safeToRetry: boolean;
  completionArtifactsReady: boolean;
};

type WorkflowSnapshot = {
  status: WorkflowHealthStatus;
  startedAt: Date | null;
  completedAt: Date | null;
};

type RunForHealth = {
  id: string;
  projectId: string;
  userId: string;
  workflowRunId: string | null;
  kind: string;
  status: string;
  config: unknown;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  acceptanceUncertainAt: Date | null;
  acceptanceDispatchClaimedAt: Date | null;
  healthCheckedAt: Date | null;
  createdAt: Date;
};

type RunFacts = {
  authoringEventCount: number;
  lastEventAt: Date | null;
  stage: Stage;
  progressPct: number;
  stageDescription: string | null;
  llmCallCount: number;
  meteredUsd: number;
  creditsUsed: number;
  reservationCount: number;
  projectCompletedAt: Date | null;
  chapterCounts: RunHealth["chapters"];
  finalChapterContentCount: number;
};

type ChapterHealthRow = {
  chapterNumber: number;
  status: string;
  contentReady: boolean;
};

const TERMINAL_DATABASE_STATUSES = new Set<AuthoringRunStatus>([
  "completed",
  "failed",
  "cancelled",
]);

const WORKFLOW_PROBE_TIMEOUT_MS = 4_000;

function asAuthoringRunStatus(status: string): AuthoringRunStatus {
  if (
    status === "queued" ||
    status === "running" ||
    status === "awaiting_input" ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled"
  ) {
    return status;
  }
  throw new Error(`Unknown generation run status: ${status}`);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Workflow status probe timed out")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function latestDate(...dates: Array<Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const date of dates) {
    if (date && (!latest || date.getTime() > latest.getTime())) latest = date;
  }
  return latest;
}

/**
 * Workflow is a second durable source of truth. A failed status lookup is
 * deliberately represented as unavailable: an API timeout must never be
 * interpreted as a failed authoring run.
 */
export async function readWorkflowSnapshot(
  workflowRunId: string | null,
): Promise<WorkflowSnapshot> {
  if (!workflowRunId) {
    return { status: "missing", startedAt: null, completedAt: null };
  }

  try {
    return await withTimeout(
      (async () => {
        const workflowRun = getRun(workflowRunId);
        const exists = await workflowRun.exists;
        if (!exists) return { status: "missing", startedAt: null, completedAt: null };

        const [status, startedAt, completedAt] = await Promise.all([
          workflowRun.status,
          workflowRun.startedAt,
          workflowRun.completedAt,
        ]);
        return {
          status,
          startedAt: startedAt ?? null,
          completedAt: completedAt ?? null,
        };
      })(),
      WORKFLOW_PROBE_TIMEOUT_MS,
    );
  } catch (error) {
    console.error("Could not read Workflow run status", { workflowRunId, error });
    return { status: "unavailable", startedAt: null, completedAt: null };
  }
}

export function deriveEffectiveRunStatus(input: {
  databaseStatus: AuthoringRunStatus;
  workflowStatus: WorkflowHealthStatus;
  completionArtifactsReady: boolean;
  workflowCompletionRequiresArtifacts?: boolean;
}): EffectiveRunStatus {
  if (TERMINAL_DATABASE_STATUSES.has(input.databaseStatus)) return input.databaseStatus;

  switch (input.workflowStatus) {
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "completed":
      if (input.workflowCompletionRequiresArtifacts === false) {
        return input.databaseStatus;
      }
      return input.completionArtifactsReady ? "completed" : "failed";
    case "running":
      return input.databaseStatus === "queued" ? "running" : input.databaseStatus;
    case "pending":
    case "missing":
    case "unavailable":
      return input.databaseStatus;
  }
}

export function workflowCompletionRequiresArtifacts(kind: string): boolean {
  return (
    kind === "full_book" || kind === "chapter" || kind === "edit_pass" || kind === "continuity"
  );
}

function generationEstimate(config: Partial<GenerationConfig>): number | null {
  const tier = config.tier;
  const chapters = config.targetChapters;
  const words = config.targetWordsPerChapter;
  if (
    (tier !== "draft" && tier !== "standard" && tier !== "premium") ||
    typeof chapters !== "number" ||
    !Number.isFinite(chapters) ||
    chapters < 1 ||
    typeof words !== "number" ||
    !Number.isFinite(words) ||
    words < 1
  ) {
    return null;
  }
  return estimateBookCost(tier as QualityTier, chapters, words).estimatedMinutes;
}

function expectedChapterCount(config: Partial<GenerationConfig>): number {
  const configured = config.targetChapters;
  return typeof configured === "number" && Number.isInteger(configured) && configured > 0
    ? configured
    : 1;
}

export function summarizeChapterRowsForRun(
  rows: ChapterHealthRow[],
  targetChapters: number,
): {
  chapters: RunHealth["chapters"];
  finalChapterContentCount: number;
} {
  const chapters: RunHealth["chapters"] = {
    total: targetChapters,
    planned: 0,
    drafting: 0,
    drafted: 0,
    edited: 0,
    final: 0,
  };
  const counted = new Set<number>();
  let finalChapterContentCount = 0;
  for (const row of rows) {
    if (
      row.chapterNumber < 1 ||
      row.chapterNumber > targetChapters ||
      counted.has(row.chapterNumber)
    ) {
      continue;
    }
    counted.add(row.chapterNumber);
    if (
      row.status === "planned" ||
      row.status === "drafting" ||
      row.status === "drafted" ||
      row.status === "edited" ||
      row.status === "final"
    ) {
      chapters[row.status] += 1;
      if (row.status === "final" && row.contentReady) finalChapterContentCount += 1;
    }
  }
  return { chapters, finalChapterContentCount };
}

export function completionArtifactsAreReady(input: {
  config: Partial<GenerationConfig>;
  projectCompletedAt: Date | null;
  finalChapterCount: number;
}): boolean {
  const finalized = input.config.completion?.finalized;
  return Boolean(
    finalized?.manuscriptDigest &&
    input.projectCompletedAt &&
    input.finalChapterCount >= expectedChapterCount(input.config),
  );
}

/**
 * A remote "completed" state is never sufficient by itself. Each authoring
 * kind must also leave run-owned durable output before reconciliation may
 * mark its database row complete.
 */
export function runCompletionArtifactsAreReady(input: {
  runId: string;
  kind: string;
  config: Partial<GenerationConfig>;
  projectCompletedAt: Date | null;
  finalChapterCount: number;
}): boolean {
  if (input.kind === "full_book") {
    return completionArtifactsAreReady(input);
  }

  const completion = input.config.completion;
  if (input.kind === "chapter") {
    return Object.values(completion?.chapterSummaries ?? {}).some(
      (checkpoint) => checkpoint.sourceRunId === input.runId && Boolean(checkpoint.contentDigest),
    );
  }
  if (input.kind === "edit_pass") {
    return [
      ...Object.values(completion?.editedChapters ?? {}),
      ...Object.values(completion?.revisionChapters ?? {}),
    ].some(
      (checkpoint) => checkpoint.sourceRunId === input.runId && Boolean(checkpoint.contentDigest),
    );
  }
  if (input.kind === "continuity") {
    return Boolean(
      completion?.continuityReport?.sourceRunId === input.runId &&
      completion.continuityReport.manuscriptDigest,
    );
  }
  return false;
}

async function readCurrentRun(run: RunForHealth): Promise<RunForHealth | null> {
  const [current] = await getDb()
    .select({
      id: schema.generationRuns.id,
      projectId: schema.generationRuns.projectId,
      userId: schema.generationRuns.userId,
      workflowRunId: schema.generationRuns.workflowRunId,
      kind: schema.generationRuns.kind,
      status: schema.generationRuns.status,
      config: schema.generationRuns.config,
      error: schema.generationRuns.error,
      startedAt: schema.generationRuns.startedAt,
      completedAt: schema.generationRuns.completedAt,
      acceptanceUncertainAt: schema.generationRuns.acceptanceUncertainAt,
      acceptanceDispatchClaimedAt: schema.generationRuns.acceptanceDispatchClaimedAt,
      healthCheckedAt: schema.generationRuns.healthCheckedAt,
      createdAt: schema.generationRuns.createdAt,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.id, run.id),
        eq(schema.generationRuns.projectId, run.projectId),
        eq(schema.generationRuns.userId, run.userId),
      ),
    )
    .limit(1);
  return current ?? null;
}

async function readRunFacts(run: RunForHealth): Promise<RunFacts> {
  const db = getDb();
  const config = (run.config ?? {}) as Partial<GenerationConfig>;

  const [
    [eventFacts],
    [stageEvent],
    [callFacts],
    [usageFacts],
    [reservationFacts],
    [projectFacts],
    chapterRows,
  ] = await Promise.all([
    db
      .select({
        authoringCount: sql<number>`count(*) filter (
          where ${schema.generationEvents.type} in ('agent', 'chapter', 'review')
            or (
              ${schema.generationEvents.type} = 'stage'
              and ${schema.generationEvents.payload}->>'stage' <> 'queued'
            )
        )::int`,
        lastAt: sql<Date | null>`max(${schema.generationEvents.createdAt})`,
      })
      .from(schema.generationEvents)
      .where(eq(schema.generationEvents.runId, run.id)),
    db
      .select({
        payload: schema.generationEvents.payload,
      })
      .from(schema.generationEvents)
      .where(
        and(eq(schema.generationEvents.runId, run.id), eq(schema.generationEvents.type, "stage")),
      )
      .orderBy(desc(schema.generationEvents.seq))
      .limit(1),
    db
      .select({
        count: sql<number>`count(*)::int`,
        usd: sql<string>`coalesce(sum(${schema.llmCalls.usd}), 0)`,
      })
      .from(schema.llmCalls)
      .where(eq(schema.llmCalls.runId, run.id)),
    db
      .select({
        credits: sql<string>`coalesce(-sum(${schema.creditLedger.amount}), 0)`,
      })
      .from(schema.creditLedger)
      .where(and(eq(schema.creditLedger.runId, run.id), eq(schema.creditLedger.kind, "usage"))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.runId, run.id),
          sql`coalesce(${schema.creditLedger.externalRef}, '') ~ '^(generation-reservation:|interactive-reservation:)'`,
        ),
      ),
    db
      .select({ completedAt: schema.projects.completedAt })
      .from(schema.projects)
      .where(eq(schema.projects.id, run.projectId))
      .limit(1),
    db
      .select({
        chapterNumber: schema.chapters.chapterNumber,
        status: schema.chapters.status,
        contentReady: sql<boolean>`(
          ${schema.chapters.wordCount} > 0
          and length(btrim(${schema.chapters.content})) > 0
        )`,
      })
      .from(schema.chapters)
      .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
      .where(eq(schema.books.projectId, run.projectId))
      .orderBy(schema.chapters.chapterNumber),
  ]);

  let latestStage: Stage = "queued";
  let progressPct = 0;
  let stageDescription: string | null = null;
  if (stageEvent) {
    const parsed = runEventSchema.safeParse(stageEvent.payload);
    if (parsed.success && parsed.data.type === "stage") {
      latestStage = parsed.data.stage;
      progressPct = parsed.data.pct;
      stageDescription = parsed.data.detail ?? null;
    }
  }

  const chapterSummary = summarizeChapterRowsForRun(chapterRows, expectedChapterCount(config));

  return {
    authoringEventCount: eventFacts?.authoringCount ?? 0,
    lastEventAt: eventFacts?.lastAt ?? null,
    stage: latestStage,
    progressPct,
    stageDescription,
    llmCallCount: callFacts?.count ?? 0,
    meteredUsd: Number(callFacts?.usd ?? 0),
    creditsUsed: Number(usageFacts?.credits ?? 0),
    reservationCount: reservationFacts?.count ?? 0,
    projectCompletedAt: projectFacts?.completedAt ?? null,
    chapterCounts: chapterSummary.chapters,
    finalChapterContentCount: chapterSummary.finalChapterContentCount,
  };
}

export async function getRunHealth(run: RunForHealth): Promise<RunHealth> {
  const [workflow, initialFacts] = await Promise.all([
    readWorkflowSnapshot(run.workflowRunId),
    readRunFacts(run),
  ]);
  let currentRun = run;
  let facts = initialFacts;
  let databaseStatus = asAuthoringRunStatus(currentRun.status);
  let config = (currentRun.config ?? {}) as Partial<GenerationConfig>;
  let requiresCompletionArtifacts = workflowCompletionRequiresArtifacts(currentRun.kind);
  let completionArtifactsReady =
    requiresCompletionArtifacts &&
    runCompletionArtifactsAreReady({
      runId: currentRun.id,
      kind: currentRun.kind,
      config,
      projectCompletedAt: facts.projectCompletedAt,
      finalChapterCount: facts.finalChapterContentCount,
    });

  // Workflow can become completed while the status endpoint is waiting on its
  // remote probe. All workflow-side database commits precede that terminal
  // state, so refresh once before exposing or persisting an artifact failure.
  if (
    workflow.status === "completed" &&
    requiresCompletionArtifacts &&
    !TERMINAL_DATABASE_STATUSES.has(databaseStatus) &&
    !completionArtifactsReady
  ) {
    const refreshedRun = await readCurrentRun(run);
    if (refreshedRun) {
      currentRun = refreshedRun;
      facts = await readRunFacts(refreshedRun);
      databaseStatus = asAuthoringRunStatus(currentRun.status);
      config = (currentRun.config ?? {}) as Partial<GenerationConfig>;
      requiresCompletionArtifacts = workflowCompletionRequiresArtifacts(currentRun.kind);
      completionArtifactsReady =
        requiresCompletionArtifacts &&
        runCompletionArtifactsAreReady({
          runId: currentRun.id,
          kind: currentRun.kind,
          config,
          projectCompletedAt: facts.projectCompletedAt,
          finalChapterCount: facts.finalChapterContentCount,
        });
    }
  }

  const effectiveStatus = deriveEffectiveRunStatus({
    databaseStatus,
    workflowStatus: workflow.status,
    completionArtifactsReady,
    workflowCompletionRequiresArtifacts: requiresCompletionArtifacts,
  });
  const authoringBegan =
    facts.authoringEventCount > 0 || facts.llmCallCount > 0 || facts.creditsUsed > 0;
  const noWorkStarted = !authoringBegan && facts.reservationCount === 0 && facts.meteredUsd === 0;
  const acceptanceState = deriveAuthoringRunAcceptanceState({
    acceptanceUncertainAt: currentRun.acceptanceUncertainAt,
    acceptanceDispatchClaimedAt: currentRun.acceptanceDispatchClaimedAt,
  });
  const acceptanceUncertain =
    databaseStatus === "queued" && !currentRun.workflowRunId && acceptanceState.acceptanceUncertain;
  const acceptedAt = currentRun.createdAt;
  const terminalAt =
    latestDate(currentRun.completedAt, workflow.completedAt) ??
    (TERMINAL_DATABASE_STATUSES.has(effectiveStatus) ? new Date() : null);
  const lastUpdateAt =
    latestDate(
      facts.lastEventAt,
      currentRun.completedAt,
      workflow.completedAt,
      currentRun.startedAt,
      workflow.startedAt,
    ) ?? acceptedAt;

  return {
    databaseStatus,
    workflowStatus: workflow.status,
    effectiveStatus,
    acceptedAt: acceptedAt.toISOString(),
    startedAt: currentRun.startedAt?.toISOString() ?? null,
    completedAt: currentRun.completedAt?.toISOString() ?? null,
    workflowStartedAt: workflow.startedAt?.toISOString() ?? null,
    workflowCompletedAt: workflow.completedAt?.toISOString() ?? null,
    lastEventAt: facts.lastEventAt?.toISOString() ?? null,
    lastUpdateAt: lastUpdateAt.toISOString(),
    elapsedMs: Math.max(0, (terminalAt ?? new Date()).getTime() - acceptedAt.getTime()),
    estimatedMinutes: generationEstimate(config),
    stage: facts.stage,
    progressPct: facts.progressPct,
    stageDescription: facts.stageDescription,
    chapters: facts.chapterCounts,
    spend: {
      meteredUsd: facts.meteredUsd,
      creditsUsed: facts.creditsUsed,
    },
    authoringBegan,
    noWorkStarted,
    acceptanceUncertain,
    safeToRetry: acceptanceUncertain && acceptanceState.safeToRetry,
    completionArtifactsReady,
  };
}

export type ReconcileRunResult =
  | { runId: string; outcome: "unchanged"; workflowStatus: WorkflowHealthStatus }
  | {
      runId: string;
      outcome: "completed" | "failed" | "cancelled";
      workflowStatus: "completed" | "failed" | "cancelled";
    }
  | {
      runId: string;
      outcome: "error";
      workflowStatus: "unavailable";
      error: string;
    };

/**
 * Repairs only a proven terminal mismatch. Pending, running, missing, and
 * unavailable Workflow states are intentionally read-only.
 */
export async function reconcileAuthoringRun(run: RunForHealth): Promise<ReconcileRunResult> {
  const health = await getRunHealth(run);
  if (TERMINAL_DATABASE_STATUSES.has(health.databaseStatus)) {
    return { runId: run.id, outcome: "unchanged", workflowStatus: health.workflowStatus };
  }

  if (health.workflowStatus === "completed") {
    if (health.completionArtifactsReady) {
      await transitionAuthoringRunState({
        runId: run.id,
        projectId: run.projectId,
        userId: run.userId,
        status: "completed",
      });
      return { runId: run.id, outcome: "completed", workflowStatus: "completed" };
    }
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: run.projectId,
      userId: run.userId,
      status: "failed",
      error: "Workflow completed without the expected authoring artifacts",
      releaseImmediately: true,
    });
    return { runId: run.id, outcome: "failed", workflowStatus: "completed" };
  }

  if (health.workflowStatus === "failed" || health.workflowStatus === "cancelled") {
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: run.projectId,
      userId: run.userId,
      status: health.workflowStatus,
      error:
        health.workflowStatus === "failed"
          ? "The authoring workflow stopped before production completed"
          : "The authoring workflow was cancelled",
      releaseImmediately: true,
    });
    return {
      runId: run.id,
      outcome: health.workflowStatus,
      workflowStatus: health.workflowStatus,
    };
  }

  return { runId: run.id, outcome: "unchanged", workflowStatus: health.workflowStatus };
}

export async function reconcileActiveAuthoringRuns(input?: {
  projectId?: string;
  limit?: number;
}): Promise<ReconcileRunResult[]> {
  const db = getDb();
  const conditions = [
    inArray(schema.generationRuns.status, [...ACTIVE_AUTHORING_RUN_STATUSES]),
    ne(schema.generationRuns.kind, "export"),
  ];
  if (input?.projectId) conditions.push(eq(schema.generationRuns.projectId, input.projectId));

  const baseQuery = db
    .select()
    .from(schema.generationRuns)
    .where(and(...conditions));
  const runs = await (
    input?.projectId
      ? baseQuery.orderBy(schema.generationRuns.createdAt)
      : baseQuery.orderBy(
          sql`coalesce(
          ${schema.generationRuns.healthCheckedAt},
          ${schema.generationRuns.createdAt}
        )`,
          schema.generationRuns.createdAt,
        )
  ).limit(Math.min(Math.max(input?.limit ?? 100, 1), 250));

  const results: ReconcileRunResult[] = [];
  const concurrency = 8;
  for (let index = 0; index < runs.length; index += concurrency) {
    const batch = runs.slice(index, index + concurrency);
    results.push(
      ...(await Promise.all(
        batch.map(async (run) => {
          // This timestamp is a durable rotation cursor. Even awaiting-input
          // and Workflow-unavailable runs move to the back of the watchdog
          // queue, so a fixed-size cron batch eventually covers every run.
          try {
            await db
              .update(schema.generationRuns)
              .set({ healthCheckedAt: new Date() })
              .where(eq(schema.generationRuns.id, run.id));
          } catch (error) {
            console.error("Could not stamp authoring run health check", {
              runId: run.id,
              error,
            });
          }
          try {
            return await reconcileAuthoringRun(run);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown reconciliation error";
            console.error("Could not reconcile authoring run", { runId: run.id, error });
            return {
              runId: run.id,
              outcome: "error",
              workflowStatus: "unavailable",
              error: message,
            } satisfies ReconcileRunResult;
          }
        }),
      )),
    );
  }
  return results;
}

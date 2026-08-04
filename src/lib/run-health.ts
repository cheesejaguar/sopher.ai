import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { getRun } from "workflow/api";

import { estimateBookCost } from "@/ai/estimate";
import type { QualityTier } from "@/ai/models";
import { getDb, schema } from "@/db";
import { netRunCreditsUsedSql } from "@/lib/billing/run-spend";
import {
  ACTIVE_AUTHORING_RUN_STATUSES,
  deriveAuthoringRunAcceptanceState,
  terminalizeAuthoringRun,
  transitionAuthoringRunState,
  type AuthoringRunStatus,
} from "@/lib/generation-runs";
import { redeliverAcceptedAuthoringRunInput } from "@/lib/authoring-inputs";
import { runEventSchema, type GenerationConfig, type Stage } from "@/lib/run-events";
import { recordAuthoringIncident, resolveAuthoringIncident } from "@/lib/authoring-incidents";
import { sendAuthoringNeedsAttentionEmail } from "@/lib/email/send";
import { resolveAuthoringEmailAction } from "@/lib/authoring-email-action";
import { isE2EWorkflowStubEnabled } from "@/lib/e2e-workflow-stub";
import { requiresRunOwnedFullBookCompletionProof } from "@/lib/run-completion-proof";
import { manuscriptEditPassCompletionIsReady } from "@/lib/manuscript-edit-pass";
import {
  readPendingCreativeQuestion,
  type CreativeQuestionForAuthor,
} from "@/lib/creative-decisions";

export type WorkflowHealthStatus =
  "pending" | "running" | "completed" | "failed" | "cancelled" | "missing" | "unavailable";

export type EffectiveRunStatus = AuthoringRunStatus;

function countPresent(values: unknown[]): number {
  return values.filter((value) => value !== undefined && value !== null).length;
}

/**
 * Counts durable, resumable boundaries without inspecting or exposing their
 * prose. Work checkpoints and applied completion checkpoints are distinct:
 * both can prevent paid work from being repeated after an interruption.
 */
export function countSavedAuthoringCheckpoints(rawConfig: unknown): number {
  const config = (rawConfig ?? {}) as Partial<GenerationConfig>;
  const work = config.work;
  const completion = config.completion;
  const chapterWorkCount = Object.values(work?.chapters ?? {}).reduce(
    (total, chapter) =>
      total +
      countPresent([
        chapter.scenePlan,
        chapter.draft,
        chapter.critique,
        chapter.summary,
        chapter.result,
      ]),
    0,
  );

  return (
    countPresent([
      config.stagedConcept,
      config.stagedOutline,
      config.retiredEntityCanon,
      config.manuscriptPrepared === true ? true : undefined,
      work?.conceptExpanded,
      work?.outline?.plan,
      work?.outline?.draft,
      work?.outline?.final,
      completion?.entityBible,
      completion?.continuityReport,
      completion?.finalized,
      config.creativeDecisions?.afterConcept,
    ]) +
    Object.values(config.preparation ?? {}).filter((value) => value === true).length +
    chapterWorkCount +
    Object.keys(work?.edits ?? {}).length +
    Object.keys(completion?.chapterSummaries ?? {}).length +
    Object.keys(completion?.editedChapters ?? {}).length +
    Object.keys(completion?.revisionChapters ?? {}).length +
    Object.keys(completion?.continuityOutcomes ?? {}).length
  );
}

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
  heartbeatAt: string | null;
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
  completionEvidence?: FullBookCompletionEvidence | null;
  health: "healthy" | "warning" | "critical" | "degraded";
  dispatchAttempts: number;
  workflowMissingCount: number;
  workflowMissingSince: string | null;
  cancellation: {
    requestedAt: string;
    reason: string | null;
  } | null;
  pause: {
    kind: "outline_approval" | "credits_topup" | "creative_decision";
    version: number;
    registeredAt: string;
    details: {
      balanceCredits?: number;
      requiredCredits?: number;
      resumeStage?: string;
      questionId?: string;
    } | null;
  } | null;
  question?: CreativeQuestionForAuthor | null;
  savedChapterCount: number;
  savedCheckpointCount: number;
  supportReference: string;
  rootErrorCode: string | null;
  rootErrorStage: string | null;
};

export type FullBookCompletionEvidence = {
  requiresRunOwnedFinalization: boolean;
  runOwnedFinalization: boolean;
  legacyCompletionCompatible: boolean;
  finalChaptersComplete: boolean;
  expectedChapterCount: number;
  finalChapterContentCount: number;
  projectCompletedAt: boolean;
  projectStatus: "draft" | "generating" | "editing" | "complete" | "archived" | null;
};

export function completedFullBookProjectionRepairPlan(input: {
  runKind: string;
  runCompletedAt: string | null;
  evidence: FullBookCompletionEvidence | null | undefined;
}): {
  conclusive: boolean;
  repairCompletedAt: boolean;
  repairStatus: boolean;
  completedAt: Date | null;
} {
  const completedAt = normalizeRunTimestamp(input.runCompletedAt);
  const evidence = input.evidence;
  const conclusive =
    input.runKind === "full_book" &&
    Boolean(evidence?.runOwnedFinalization || evidence?.legacyCompletionCompatible) &&
    (Boolean(evidence?.projectCompletedAt) || completedAt !== null);
  return {
    conclusive,
    repairCompletedAt: conclusive && !evidence?.projectCompletedAt,
    repairStatus:
      conclusive &&
      (evidence?.projectStatus === "draft" || evidence?.projectStatus === "generating"),
    completedAt,
  };
}

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
  currentStage: Stage;
  progressPct: number;
  stageDescription: string | null;
  lastProgressAt: Date | null;
  heartbeatAt: Date | null;
  workflowObservedStatus: WorkflowHealthStatus | null;
  workflowObservedAt: Date | null;
  workflowMissingSince: Date | null;
  workflowMissingCount: number;
  dispatchAttempts: number;
  cancellationRequestedAt: Date | null;
  cancellationReason: string | null;
  pauseKind: "outline_approval" | "credits_topup" | "creative_decision" | null;
  pauseVersion: number;
  pauseDetails: {
    balanceCredits?: number;
    requiredCredits?: number;
    resumeStage?: string;
    questionId?: string;
  } | null;
  pauseRegisteredAt: Date | null;
  supportReference: string;
  rootErrorCode: string | null;
  rootErrorStage: string | null;
  createdAt: Date;
};

type RunFacts = {
  authoringEventCount: number;
  lastEventAt: Date | null;
  lastStageEventAt: Date | null;
  stage: Stage;
  progressPct: number;
  stageDescription: string | null;
  llmCallCount: number;
  meteredUsd: number;
  creditsUsed: number;
  reservationCount: number;
  projectCompletedAt: Date | null;
  projectStatus: FullBookCompletionEvidence["projectStatus"];
  chapterCounts: RunHealth["chapters"];
  finalChapterContentCount: number;
};

export function canonicalRunProgress(input: {
  effectiveStatus: AuthoringRunStatus;
  persisted: {
    stage: Stage;
    progressPct: number;
    stageDescription: string | null;
    lastProgressAt: Date | null;
  };
  event: {
    stage: Stage;
    progressPct: number;
    stageDescription: string | null;
    createdAt: Date | null;
  };
}): { stage: Stage; progressPct: number; stageDescription: string | null } {
  const persistedIsAtLeastAsNew =
    input.persisted.lastProgressAt !== null &&
    (input.event.createdAt === null ||
      input.persisted.lastProgressAt.getTime() >= input.event.createdAt.getTime());
  const usePersisted =
    persistedIsAtLeastAsNew ||
    (input.event.createdAt === null && input.persisted.stage !== "queued");
  const projection = usePersisted ? input.persisted : input.event;
  const terminalStage =
    input.effectiveStatus === "completed"
      ? "done"
      : input.effectiveStatus === "failed"
        ? "failed"
        : input.effectiveStatus === "cancelled"
          ? "cancelled"
          : null;

  // Protocol-v1 Workflows remain pinned to their original deployment. They can
  // terminalize after this deployment's migration without updating the new
  // progress projection columns. The terminal database/Workflow result is
  // authoritative, while the newest projection or event still supplies the
  // last truthful percentage and explanation.
  if (terminalStage) {
    return {
      stage: terminalStage,
      progressPct: terminalStage === "done" ? 100 : projection.progressPct,
      stageDescription: projection.stageDescription,
    };
  }

  return {
    stage: projection.stage,
    progressPct: projection.progressPct,
    stageDescription: projection.stageDescription,
  };
}

type ChapterHealthRow = {
  chapterNumber: number;
  status: string;
  contentReady: boolean;
};

type TimestampValue = Date | string | number | null | undefined;

const TERMINAL_DATABASE_STATUSES = new Set<AuthoringRunStatus>([
  "completed",
  "failed",
  "cancelled",
]);

const WORKFLOW_PROBE_TIMEOUT_MS = 4_000;
export const RUN_HEARTBEAT_WARNING_MS = 15 * 60_000;
export const RUN_HEARTBEAT_CRITICAL_MS = 30 * 60_000;
export const RUN_QUEUED_WARNING_MS = 10 * 60_000;
export const RUN_MISSING_TERMINAL_EVIDENCE_MS = 10 * 60_000;
export const RUN_CANCELLATION_WARNING_MS = 10 * 60_000;

export function deriveWorkflowMissingObservationTransition(input: {
  status: WorkflowHealthStatus;
  currentCount: number;
  currentSince: Date | null;
  observedAt: Date;
}): {
  mode: "increment" | "preserve" | "reset";
  nextCount: number;
  nextSince: Date | null;
} {
  if (input.status === "missing") {
    return {
      mode: "increment",
      nextCount: input.currentCount + 1,
      nextSince: input.currentSince ?? input.observedAt,
    };
  }
  if (input.status === "unavailable") {
    return {
      mode: "preserve",
      nextCount: input.currentCount,
      nextSince: input.currentSince,
    };
  }
  return { mode: "reset", nextCount: 0, nextSince: null };
}

export function hasConclusiveMissingWorkflowEvidence(input: {
  count: number;
  since: Date | string | null;
  now?: Date;
}): boolean {
  const since = normalizeRunTimestamp(input.since);
  const now = input.now ?? new Date();
  return Boolean(
    input.count >= 3 &&
    since &&
    now.getTime() - since.getTime() >= RUN_MISSING_TERMINAL_EVIDENCE_MS,
  );
}

export function classifyRunHealth(input: {
  databaseStatus: AuthoringRunStatus;
  workflowStatus: WorkflowHealthStatus;
  acceptedAt: Date;
  lastUpdateAt: Date;
  cancellationRequestedAt: Date | null;
  remainingEstimateMs?: number | null;
  now?: Date;
}): RunHealth["health"] {
  const now = input.now ?? new Date();
  if (TERMINAL_DATABASE_STATUSES.has(input.databaseStatus)) return "healthy";
  if (
    input.cancellationRequestedAt &&
    now.getTime() - input.cancellationRequestedAt.getTime() >= RUN_CANCELLATION_WARNING_MS
  ) {
    return "critical";
  }
  const silenceMs = now.getTime() - input.lastUpdateAt.getTime();
  const estimateCritical =
    typeof input.remainingEstimateMs === "number" &&
    input.remainingEstimateMs > 0 &&
    silenceMs >= input.remainingEstimateMs * 2;
  if (silenceMs >= RUN_HEARTBEAT_CRITICAL_MS || estimateCritical) return "critical";
  if (
    input.databaseStatus === "queued" &&
    now.getTime() - input.acceptedAt.getTime() >= RUN_QUEUED_WARNING_MS
  ) {
    return "warning";
  }
  if (silenceMs >= RUN_HEARTBEAT_WARNING_MS || input.cancellationRequestedAt) return "warning";
  if (input.workflowStatus === "unavailable") return "degraded";
  return "healthy";
}

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

/**
 * Raw SQL aggregates are not passed through Drizzle's column decoder. Neon
 * therefore returns max(timestamp) as an ISO string even when the sql template
 * is annotated as Date. Normalize every mixed timestamp boundary before date
 * arithmetic so a health probe can never crash the production page.
 */
export function normalizeRunTimestamp(value: TimestampValue): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestDate(...timestamps: TimestampValue[]): Date | null {
  let latest: Date | null = null;
  for (const timestamp of timestamps) {
    const date = normalizeRunTimestamp(timestamp);
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
  if (isE2EWorkflowStubEnabled() && workflowRunId === "e2e-workflow-unavailable") {
    return { status: "unavailable", startedAt: null, completedAt: null };
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

async function persistWorkflowObservation(
  run: RunForHealth,
  workflow: WorkflowSnapshot,
): Promise<{
  missingCount: number;
  missingSince: Date | null;
}> {
  const now = new Date();
  const transition = deriveWorkflowMissingObservationTransition({
    status: workflow.status,
    currentCount: run.workflowMissingCount,
    currentSince: run.workflowMissingSince,
    observedAt: now,
  });
  try {
    const [observed] = await getDb()
      .update(schema.generationRuns)
      .set({
        workflowObservedStatus: workflow.status,
        workflowObservedAt: now,
        workflowMissingCount:
          transition.mode === "increment"
            ? sql`${schema.generationRuns.workflowMissingCount} + 1`
            : transition.mode === "preserve"
              ? sql`${schema.generationRuns.workflowMissingCount}`
              : 0,
        workflowMissingSince:
          transition.mode === "increment"
            ? sql`coalesce(${schema.generationRuns.workflowMissingSince}, ${now})`
            : transition.mode === "preserve"
              ? sql`${schema.generationRuns.workflowMissingSince}`
              : null,
      })
      .where(eq(schema.generationRuns.id, run.id))
      .returning({
        missingCount: schema.generationRuns.workflowMissingCount,
        missingSince: schema.generationRuns.workflowMissingSince,
      });
    return {
      missingCount: observed?.missingCount ?? run.workflowMissingCount,
      missingSince: observed?.missingSince ?? run.workflowMissingSince,
    };
  } catch (error) {
    // Observation persistence improves recovery evidence, but a status page
    // must still render when this best-effort write is unavailable.
    console.error("Could not persist Workflow observation", { runId: run.id, error });
  }
  return {
    missingCount: run.workflowMissingCount,
    missingSince: run.workflowMissingSince,
  };
}

export function deriveEffectiveRunStatus(input: {
  databaseStatus: AuthoringRunStatus;
  workflowStatus: WorkflowHealthStatus;
  completionArtifactsReady: boolean;
  workflowCompletionRequiresArtifacts?: boolean;
}): EffectiveRunStatus {
  if (input.databaseStatus === "completed") {
    return input.workflowCompletionRequiresArtifacts === false || input.completionArtifactsReady
      ? "completed"
      : "failed";
  }
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

export function generationEstimate(config: Partial<GenerationConfig>): number | null {
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
  runId: string;
  config: Partial<GenerationConfig>;
  projectCompletedAt: Date | null;
  finalChapterCount: number;
  databaseStatus?: AuthoringRunStatus;
}): boolean {
  const evidence = fullBookCompletionEvidence({
    ...input,
    projectStatus: null,
  });
  return (
    (evidence.runOwnedFinalization || evidence.legacyCompletionCompatible) &&
    evidence.projectCompletedAt &&
    (input.databaseStatus === "completed" || evidence.finalChaptersComplete)
  );
}

export function fullBookCompletionEvidence(input: {
  runId: string;
  config: Partial<GenerationConfig>;
  projectCompletedAt: Date | null;
  projectStatus: FullBookCompletionEvidence["projectStatus"];
  finalChapterCount: number;
  databaseStatus?: AuthoringRunStatus;
}): FullBookCompletionEvidence {
  const finalized = input.config.completion?.finalized;
  const expected = expectedChapterCount(input.config);
  const requiresRunOwnedFinalization = requiresRunOwnedFullBookCompletionProof(input.config);
  const runOwnedFinalization = Boolean(
    finalized?.manuscriptDigest && finalized.sourceRunId === input.runId,
  );
  const finalChaptersComplete = input.finalChapterCount >= expected;
  const projectCompletedAt = input.projectCompletedAt !== null;
  return {
    requiresRunOwnedFinalization,
    runOwnedFinalization,
    legacyCompletionCompatible:
      !requiresRunOwnedFinalization &&
      (input.databaseStatus === "completed" || (projectCompletedAt && finalChaptersComplete)),
    finalChaptersComplete,
    expectedChapterCount: expected,
    finalChapterContentCount: input.finalChapterCount,
    projectCompletedAt,
    projectStatus: input.projectStatus,
  };
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
  databaseStatus?: AuthoringRunStatus;
}): boolean {
  if (input.kind === "full_book") {
    return completionArtifactsAreReady({
      runId: input.runId,
      config: input.config,
      projectCompletedAt: input.projectCompletedAt,
      finalChapterCount: input.finalChapterCount,
      databaseStatus: input.databaseStatus,
    });
  }

  const completion = input.config.completion;
  if (input.kind === "chapter") {
    return Object.values(completion?.chapterSummaries ?? {}).some(
      (checkpoint) => checkpoint.sourceRunId === input.runId && Boolean(checkpoint.contentDigest),
    );
  }
  if (input.kind === "edit_pass") {
    return (
      manuscriptEditPassCompletionIsReady(input.runId, input.config) ||
      [
        ...Object.values(completion?.editedChapters ?? {}),
        ...Object.values(completion?.revisionChapters ?? {}),
      ].some(
        (checkpoint) => checkpoint.sourceRunId === input.runId && Boolean(checkpoint.contentDigest),
      )
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
      currentStage: schema.generationRuns.currentStage,
      progressPct: schema.generationRuns.progressPct,
      stageDescription: schema.generationRuns.stageDescription,
      lastProgressAt: schema.generationRuns.lastProgressAt,
      heartbeatAt: schema.generationRuns.heartbeatAt,
      workflowObservedStatus: schema.generationRuns.workflowObservedStatus,
      workflowObservedAt: schema.generationRuns.workflowObservedAt,
      workflowMissingSince: schema.generationRuns.workflowMissingSince,
      workflowMissingCount: schema.generationRuns.workflowMissingCount,
      dispatchAttempts: schema.generationRuns.dispatchAttempts,
      cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
      cancellationReason: schema.generationRuns.cancellationReason,
      pauseKind: schema.generationRuns.pauseKind,
      pauseVersion: schema.generationRuns.pauseVersion,
      pauseDetails: schema.generationRuns.pauseDetails,
      pauseRegisteredAt: schema.generationRuns.pauseRegisteredAt,
      supportReference: schema.generationRuns.supportReference,
      rootErrorCode: schema.generationRuns.rootErrorCode,
      rootErrorStage: schema.generationRuns.rootErrorStage,
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
          where ${schema.generationEvents.type} in ('agent', 'chapter', 'review', 'tool_mutation')
            or (
              ${schema.generationEvents.type} = 'stage'
              and ${schema.generationEvents.payload}->>'stage' <> 'queued'
            )
        )::int`,
        // Raw timestamp aggregates are returned as strings by neon-http.
        lastAt: sql<Date | string | null>`max(${schema.generationEvents.createdAt})`,
      })
      .from(schema.generationEvents)
      .where(eq(schema.generationEvents.runId, run.id)),
    db
      .select({
        payload: schema.generationEvents.payload,
        createdAt: schema.generationEvents.createdAt,
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
        credits: netRunCreditsUsedSql(),
      })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.runId, run.id)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.runId, run.id),
          sql`coalesce(${schema.creditLedger.externalRef}, '') ~ '^(generation-reservation:|interactive-reservation:)'`,
          sql`not exists (
            select 1
            from credit_ledger released
            where released.external_ref = 'release:' || ${schema.creditLedger.externalRef}
          )`,
        ),
      ),
    db
      .select({
        completedAt: schema.projects.completedAt,
        status: schema.projects.status,
      })
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
    lastEventAt: normalizeRunTimestamp(eventFacts?.lastAt),
    lastStageEventAt: stageEvent?.createdAt ?? null,
    stage: latestStage,
    progressPct,
    stageDescription,
    llmCallCount: callFacts?.count ?? 0,
    meteredUsd: Number(callFacts?.usd ?? 0),
    creditsUsed: Number(usageFacts?.credits ?? 0),
    reservationCount: reservationFacts?.count ?? 0,
    projectCompletedAt: projectFacts?.completedAt ?? null,
    projectStatus: projectFacts?.status ?? null,
    chapterCounts: chapterSummary.chapters,
    finalChapterContentCount: chapterSummary.finalChapterContentCount,
  };
}

export async function getRunHealth(run: RunForHealth): Promise<RunHealth> {
  const [workflow, initialFacts] = await Promise.all([
    readWorkflowSnapshot(run.workflowRunId),
    readRunFacts(run),
  ]);
  const workflowObservation = await persistWorkflowObservation(run, workflow);
  let currentRun = run;
  let facts = initialFacts;
  let databaseStatus = asAuthoringRunStatus(currentRun.status);
  let config = (currentRun.config ?? {}) as Partial<GenerationConfig>;
  let requiresCompletionArtifacts = workflowCompletionRequiresArtifacts(currentRun.kind);
  let completionEvidence =
    currentRun.kind === "full_book"
      ? fullBookCompletionEvidence({
          runId: currentRun.id,
          config,
          projectCompletedAt: facts.projectCompletedAt,
          projectStatus: facts.projectStatus,
          finalChapterCount: facts.finalChapterContentCount,
          databaseStatus,
        })
      : null;
  let completionArtifactsReady =
    requiresCompletionArtifacts &&
    runCompletionArtifactsAreReady({
      runId: currentRun.id,
      kind: currentRun.kind,
      config,
      projectCompletedAt: facts.projectCompletedAt,
      finalChapterCount: facts.finalChapterContentCount,
      databaseStatus,
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
      completionEvidence =
        currentRun.kind === "full_book"
          ? fullBookCompletionEvidence({
              runId: currentRun.id,
              config,
              projectCompletedAt: facts.projectCompletedAt,
              projectStatus: facts.projectStatus,
              finalChapterCount: facts.finalChapterContentCount,
              databaseStatus,
            })
          : null;
      completionArtifactsReady =
        requiresCompletionArtifacts &&
        runCompletionArtifactsAreReady({
          runId: currentRun.id,
          kind: currentRun.kind,
          config,
          projectCompletedAt: facts.projectCompletedAt,
          finalChapterCount: facts.finalChapterContentCount,
          databaseStatus,
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
      currentRun.heartbeatAt,
      currentRun.lastProgressAt,
      currentRun.completedAt,
      workflow.completedAt,
      currentRun.startedAt,
      workflow.startedAt,
    ) ?? acceptedAt;
  const heartbeatAt = latestDate(
    currentRun.heartbeatAt,
    currentRun.lastProgressAt,
    facts.lastEventAt,
  );
  const canonicalProgress = canonicalRunProgress({
    effectiveStatus,
    persisted: {
      stage: currentRun.currentStage,
      progressPct: currentRun.progressPct,
      stageDescription: currentRun.stageDescription,
      lastProgressAt: currentRun.lastProgressAt,
    },
    event: {
      stage: facts.stage,
      progressPct: facts.progressPct,
      stageDescription: facts.stageDescription,
      createdAt: facts.lastStageEventAt,
    },
  });
  const canonicalStage = canonicalProgress.stage;
  const canonicalPct = canonicalProgress.progressPct;
  const canonicalDescription = canonicalProgress.stageDescription;
  const estimatedMinutes = generationEstimate(config);
  const remainingEstimateMs =
    estimatedMinutes === null
      ? null
      : estimatedMinutes * 60_000 * Math.max(0, 1 - canonicalPct / 100);
  const health = classifyRunHealth({
    databaseStatus,
    workflowStatus: workflow.status,
    acceptedAt,
    lastUpdateAt,
    cancellationRequestedAt: currentRun.cancellationRequestedAt,
    remainingEstimateMs,
  });
  const question =
    currentRun.pauseKind === "creative_decision" && currentRun.pauseRegisteredAt
      ? await readPendingCreativeQuestion(currentRun.id)
      : null;

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
    heartbeatAt: heartbeatAt?.toISOString() ?? null,
    lastUpdateAt: lastUpdateAt.toISOString(),
    elapsedMs: Math.max(0, (terminalAt ?? new Date()).getTime() - acceptedAt.getTime()),
    estimatedMinutes,
    stage: canonicalStage,
    progressPct: canonicalPct,
    stageDescription: canonicalDescription,
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
    completionEvidence,
    health,
    dispatchAttempts: currentRun.dispatchAttempts,
    workflowMissingCount: workflowObservation.missingCount,
    workflowMissingSince: workflowObservation.missingSince?.toISOString() ?? null,
    cancellation: currentRun.cancellationRequestedAt
      ? {
          requestedAt: currentRun.cancellationRequestedAt.toISOString(),
          reason: currentRun.cancellationReason,
        }
      : null,
    pause:
      currentRun.pauseKind && currentRun.pauseRegisteredAt
        ? {
            kind: currentRun.pauseKind,
            version: currentRun.pauseVersion,
            registeredAt: currentRun.pauseRegisteredAt.toISOString(),
            details: currentRun.pauseDetails,
          }
        : null,
    question,
    savedChapterCount:
      facts.chapterCounts.drafted + facts.chapterCounts.edited + facts.chapterCounts.final,
    savedCheckpointCount: countSavedAuthoringCheckpoints(config),
    supportReference: currentRun.supportReference,
    rootErrorCode: currentRun.rootErrorCode,
    rootErrorStage: currentRun.rootErrorStage,
  };
}

export type ReconcileRunResult =
  | { runId: string; outcome: "unchanged"; workflowStatus: WorkflowHealthStatus }
  | {
      runId: string;
      outcome: "completed" | "failed" | "cancelled";
      workflowStatus: WorkflowHealthStatus;
    }
  | {
      runId: string;
      outcome: "error";
      workflowStatus: "unavailable";
      error: string;
    };

type AcceptedInputRedeliveryOutcome = Awaited<
  ReturnType<typeof redeliverAcceptedAuthoringRunInput>
>;

type WatchdogInputRedeliveryDependencies = {
  findAcceptedInputId(input: {
    runId: string;
    kind: NonNullable<RunHealth["pause"]>["kind"];
    pauseVersion: number;
  }): Promise<string | null>;
  redeliver(input: { inputId: string }): Promise<AcceptedInputRedeliveryOutcome>;
};

const watchdogInputRedeliveryDependencies: WatchdogInputRedeliveryDependencies = {
  async findAcceptedInputId(input) {
    const [row] = await getDb()
      .select({ id: schema.authoringRunInputs.id })
      .from(schema.authoringRunInputs)
      .where(
        and(
          eq(schema.authoringRunInputs.runId, input.runId),
          eq(schema.authoringRunInputs.kind, input.kind),
          eq(schema.authoringRunInputs.pauseVersion, input.pauseVersion),
          eq(schema.authoringRunInputs.status, "accepted"),
        ),
      )
      .orderBy(desc(schema.authoringRunInputs.acceptedAt))
      .limit(1);
    return row?.id ?? null;
  },
  redeliver: redeliverAcceptedAuthoringRunInput,
};

/**
 * Replays a response-loss-safe v2 input only while its exact pause remains
 * authoritative. The durable input helper rechecks the run under the project
 * lock and enforces its grace period, making repeated watchdog passes safe.
 */
export async function redeliverAcceptedInputForWatchdog(
  input: {
    runId: string;
    config: unknown;
    databaseStatus: AuthoringRunStatus;
    effectiveStatus: AuthoringRunStatus;
    cancellation: RunHealth["cancellation"];
    pause: RunHealth["pause"];
  },
  dependencies: WatchdogInputRedeliveryDependencies = watchdogInputRedeliveryDependencies,
): Promise<AcceptedInputRedeliveryOutcome> {
  const protocolVersion = (input.config as Partial<GenerationConfig> | null)?.protocolVersion;
  if (
    (protocolVersion !== 2 && protocolVersion !== 3) ||
    input.databaseStatus !== "awaiting_input" ||
    input.effectiveStatus !== "awaiting_input" ||
    input.cancellation ||
    !input.pause
  ) {
    return "not_eligible";
  }

  const inputId = await dependencies.findAcceptedInputId({
    runId: input.runId,
    kind: input.pause.kind,
    pauseVersion: input.pause.version,
  });
  if (!inputId) return "not_eligible";
  return dependencies.redeliver({ inputId });
}

async function notifyRunNeedsAttention(run: RunForHealth, health: RunHealth): Promise<void> {
  try {
    const [row] = await getDb()
      .select({
        email: schema.users.email,
        title: schema.projects.title,
      })
      .from(schema.projects)
      .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
      .where(eq(schema.projects.id, run.projectId))
      .limit(1);
    if (!row?.email) return;
    const nextAction = await resolveAuthoringEmailAction({
      userId: run.userId,
      projectId: run.projectId,
      supportReference: health.supportReference,
    });
    await sendAuthoringNeedsAttentionEmail({
      userId: run.userId,
      to: row.email,
      bookTitle: row.title,
      runId: run.id,
      savedChapterCount: health.savedChapterCount,
      creditsUsed: health.spend.creditsUsed,
      noWorkStarted: health.noWorkStarted,
      supportReference: health.supportReference,
      nextActionHref: nextAction.href,
      nextActionLabel: nextAction.label,
      // Same two fields the in-app recovery card reads off this health object,
      // resolved the same way. Omitting them made the email say "worth trying
      // again" for failures the card correctly tells the author not to retry.
      errorCode: health.rootErrorCode,
      errorStage: health.rootErrorStage ?? health.stage,
    });
  } catch (error) {
    console.warn("[email] authoring attention notification failed:", error);
  }
}

async function repairConclusiveCompletedProjectProjection(
  run: RunForHealth,
  health: RunHealth,
): Promise<boolean> {
  const plan = completedFullBookProjectionRepairPlan({
    runKind: run.kind,
    runCompletedAt: health.completedAt,
    evidence: health.completionEvidence,
  });
  if (!plan.conclusive) return false;

  if (plan.repairStatus || plan.repairCompletedAt) {
    await getDb()
      .update(schema.projects)
      .set({
        ...(plan.repairCompletedAt ? { completedAt: plan.completedAt } : {}),
        ...(plan.repairStatus ? { status: "editing" as const } : {}),
      })
      .where(and(eq(schema.projects.id, run.projectId), eq(schema.projects.userId, run.userId)));
  }
  return true;
}

type ReconcileAuthoringRunDependencies = {
  getHealth: (run: RunForHealth) => Promise<RunHealth>;
  transitionRun: typeof transitionAuthoringRunState;
};

/** Reconciles only evidence-backed terminal states and records ambiguity. */
export async function reconcileAuthoringRun(
  run: RunForHealth,
  dependencies: Partial<ReconcileAuthoringRunDependencies> = {},
): Promise<ReconcileRunResult> {
  const health = await (dependencies.getHealth ?? getRunHealth)(run);
  try {
    await redeliverAcceptedInputForWatchdog({
      runId: run.id,
      config: run.config,
      databaseStatus: health.databaseStatus,
      effectiveStatus: health.effectiveStatus,
      cancellation: health.cancellation,
      pause: health.pause,
    });
  } catch (error) {
    // The input remains accepted with its delivery error recorded. A later
    // watchdog pass can retry it without changing the pause or author answer.
    console.warn("Could not redeliver accepted authoring input", {
      runId: run.id,
      error,
    });
  }
  if (TERMINAL_DATABASE_STATUSES.has(health.databaseStatus)) {
    if (
      health.databaseStatus === "completed" &&
      (await repairConclusiveCompletedProjectProjection(run, health))
    ) {
      await resolveAuthoringIncident({ runId: run.id, dedupeKey: "completion-contradiction" });
      return { runId: run.id, outcome: "unchanged", workflowStatus: health.workflowStatus };
    }
    if (health.databaseStatus === "completed" && !health.completionArtifactsReady) {
      await recordAuthoringIncident({
        runId: run.id,
        projectId: run.projectId,
        category: "completion_contradiction",
        severity: "critical",
        dedupeKey: "completion-contradiction",
        evidence: {
          databaseStatus: health.databaseStatus,
          expectedChapters: health.chapters.total,
          finalChapters: health.chapters.final,
        },
      });
      await transitionAuthoringRunState({
        runId: run.id,
        projectId: run.projectId,
        userId: run.userId,
        status: "failed",
        error: "Completed run is missing its run-owned finalization proof",
        errorCode: "completion_contradiction",
        errorStage: health.stage,
      });
      await notifyRunNeedsAttention(run, health);
      return { runId: run.id, outcome: "failed", workflowStatus: health.workflowStatus };
    }
    return { runId: run.id, outcome: "unchanged", workflowStatus: health.workflowStatus };
  }

  if (health.workflowStatus === "completed") {
    if (health.completionArtifactsReady) {
      const transition = await (dependencies.transitionRun ?? transitionAuthoringRunState)({
        runId: run.id,
        projectId: run.projectId,
        userId: run.userId,
        status: "completed",
        resolveCancellationOnComplete: true,
      });
      if (
        transition.status === "completed" ||
        transition.status === "cancelled" ||
        transition.status === "failed"
      ) {
        return {
          runId: run.id,
          outcome: transition.status,
          workflowStatus: "completed",
        };
      }
      return { runId: run.id, outcome: "unchanged", workflowStatus: "completed" };
    }
    await recordAuthoringIncident({
      runId: run.id,
      projectId: run.projectId,
      category: "completion_contradiction",
      severity: "critical",
      dedupeKey: "completion-contradiction",
      evidence: {
        expectedChapters: health.chapters.total,
        finalChapters: health.chapters.final,
        workflowStatus: health.workflowStatus,
      },
    });
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: run.projectId,
      userId: run.userId,
      status: "failed",
      error: "Workflow completed without the expected authoring artifacts",
      errorCode: "completion_contradiction",
      errorStage: health.stage,
      releaseImmediately: true,
    });
    await notifyRunNeedsAttention(run, health);
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
      errorCode: health.workflowStatus === "failed" ? "workflow_failed" : undefined,
      errorStage: health.stage,
      releaseImmediately: true,
    });
    if (health.workflowStatus === "failed") await notifyRunNeedsAttention(run, health);
    return {
      runId: run.id,
      outcome: health.workflowStatus,
      workflowStatus: health.workflowStatus,
    };
  }

  if (health.safeToRetry && health.dispatchAttempts < 3 && !health.cancellation) {
    await recordAuthoringIncident({
      runId: run.id,
      projectId: run.projectId,
      category: "dispatch",
      severity: "warning",
      dedupeKey: "dispatch-recovery",
      evidence: {
        attempts: health.dispatchAttempts,
        acceptedAgeMs: health.elapsedMs,
      },
    });
    const { redispatchUncertainAuthoringRun } = await import("@/lib/authoring-dispatch");
    const redispatch = await redispatchUncertainAuthoringRun({
      runId: run.id,
      projectId: run.projectId,
      userId: run.userId,
    });
    if (redispatch.outcome === "started" || redispatch.outcome === "reattached") {
      await resolveAuthoringIncident({ runId: run.id, dedupeKey: "dispatch-recovery" });
    }
    return { runId: run.id, outcome: "unchanged", workflowStatus: health.workflowStatus };
  }

  if (
    health.safeToRetry &&
    health.dispatchAttempts >= 3 &&
    health.noWorkStarted &&
    !health.cancellation
  ) {
    await recordAuthoringIncident({
      runId: run.id,
      projectId: run.projectId,
      category: "dispatch",
      severity: "critical",
      dedupeKey: "dispatch-exhausted",
      evidence: { attempts: health.dispatchAttempts },
    });
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: run.projectId,
      userId: run.userId,
      status: "failed",
      error: "Writing didn’t begin. No credits were used.",
      errorCode: "dispatch_exhausted",
      errorStage: health.stage,
      releaseImmediately: true,
    });
    await notifyRunNeedsAttention(run, health);
    return { runId: run.id, outcome: "failed", workflowStatus: health.workflowStatus };
  }

  if (
    health.workflowStatus === "missing" &&
    hasConclusiveMissingWorkflowEvidence({
      count: health.workflowMissingCount,
      since: health.workflowMissingSince,
    })
  ) {
    await recordAuthoringIncident({
      runId: run.id,
      projectId: run.projectId,
      category: "workflow_missing",
      severity: "critical",
      dedupeKey: "workflow-missing",
      evidence: {
        observations: health.workflowMissingCount,
        authoringBegan: health.authoringBegan,
      },
    });
    const cancelled = Boolean(health.cancellation);
    // Three authoritative missing observations prove that no remote call can
    // still consume the reservation. An untouched hold is released by the
    // terminalization below and is not evidence that writing began.
    const zeroWork = !health.authoringBegan;
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: run.projectId,
      userId: run.userId,
      status: cancelled ? "cancelled" : "failed",
      error: cancelled
        ? "The authoring workflow was cancelled"
        : zeroWork
          ? "Writing didn’t begin. No credits were used."
          : "Production was interrupted. Your completed work is saved.",
      errorCode: cancelled ? undefined : zeroWork ? "workflow_missing_zero_work" : "needs_recovery",
      errorStage: health.stage,
      releaseImmediately: true,
    });
    if (!cancelled) await notifyRunNeedsAttention(run, health);
    return {
      runId: run.id,
      outcome: cancelled ? "cancelled" : "failed",
      workflowStatus: "missing",
    };
  }

  if (health.workflowStatus !== "missing") {
    await resolveAuthoringIncident({ runId: run.id, dedupeKey: "workflow-missing" });
  }
  if (run.status === "awaiting_input" && !health.pause) {
    await recordAuthoringIncident({
      runId: run.id,
      projectId: run.projectId,
      category: "invalid_pause",
      severity: "critical",
      dedupeKey: "invalid-pause",
      evidence: { databaseStatus: run.status, stage: health.stage },
    });
  } else {
    await resolveAuthoringIncident({ runId: run.id, dedupeKey: "invalid-pause" });
  }

  if (health.health === "warning" || health.health === "critical") {
    const lastUpdate = normalizeRunTimestamp(health.lastUpdateAt);
    await recordAuthoringIncident({
      runId: run.id,
      projectId: run.projectId,
      category: "stalled_heartbeat",
      severity: health.health,
      dedupeKey: "stalled-heartbeat",
      evidence: {
        silenceMs: lastUpdate ? Date.now() - lastUpdate.getTime() : null,
        workflowStatus: health.workflowStatus,
        stage: health.stage,
      },
    });
  } else {
    await resolveAuthoringIncident({ runId: run.id, dedupeKey: "stalled-heartbeat" });
  }
  if (health.cancellation) {
    const requestedAt = normalizeRunTimestamp(health.cancellation.requestedAt);
    const ageMs = requestedAt ? Date.now() - requestedAt.getTime() : 0;
    if (ageMs >= RUN_CANCELLATION_WARNING_MS) {
      await recordAuthoringIncident({
        runId: run.id,
        projectId: run.projectId,
        category: "cancellation_unconfirmed",
        severity: "critical",
        dedupeKey: "cancellation-unconfirmed",
        evidence: { ageMs, workflowStatus: health.workflowStatus },
      });
    }
  } else {
    await resolveAuthoringIncident({ runId: run.id, dedupeKey: "cancellation-unconfirmed" });
  }

  return { runId: run.id, outcome: "unchanged", workflowStatus: health.workflowStatus };
}

export function authoringReconciliationCandidateCondition() {
  return or(
    inArray(schema.generationRuns.status, [...ACTIVE_AUTHORING_RUN_STATUSES]),
    and(eq(schema.generationRuns.status, "completed"), eq(schema.generationRuns.kind, "full_book")),
  )!;
}

export async function reconcileActiveAuthoringRuns(input?: {
  projectId?: string;
  limit?: number;
}): Promise<ReconcileRunResult[]> {
  const db = getDb();
  const conditions = [
    ne(schema.generationRuns.kind, "export"),
    authoringReconciliationCandidateCondition(),
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

"use client";

import * as React from "react";
import { runEventSchema, type RunEvent, type Stage } from "@/lib/run-events";
import { creditsForUsd } from "@/lib/billing/credits-shared";
import type { CreativeQuestionForAuthor } from "@/lib/creative-decisions";

/**
 * Client hook over GET /api/runs/[runId]/stream (NDJSON).
 *
 * The "progress" namespace carries RunEvents; "chapter:N" namespaces carry
 * JSON-encoded prose delta strings. Both are resumable: we count every stream
 * value received and pass it back as ?startIndex on reconnect so replay
 * resumes exactly where the connection dropped.
 *
 * Consumers must remount the hook when runId changes (key the component by
 * runId) — internal accumulators are per-run.
 */

export type ChapterStatus = "planned" | "drafting" | "drafted" | "edited" | "final";

export type ChapterProgress = {
  status: ChapterStatus;
  wordCount?: number;
  qualityScore?: number;
};

export type AgentName = Extract<RunEvent, { type: "agent" }>["agent"];
export type PausedStage = NonNullable<Extract<RunEvent, { type: "stage" }>["resumeStage"]>;

export type AgentFeedItem = {
  id: number;
  agent: AgentName;
  message: string;
  chapterNumber?: number;
};

export type RunConnection = "connecting" | "live" | "ended" | "reconnecting";

export type WorkflowStatus =
  "pending" | "running" | "completed" | "failed" | "cancelled" | "missing" | "unavailable";

export type RunHealth = {
  databaseStatus: RunStatus;
  workflowStatus?: WorkflowStatus;
  effectiveStatus: RunStatus;
  stage?: Stage;
  progressPct?: number;
  stageDescription?: string | null;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  lastEventAt?: string;
  heartbeatAt?: string;
  lastUpdateAt?: string;
  health?: "healthy" | "warning" | "critical" | "degraded";
  telemetryDegraded?: boolean;
  consecutiveHealthFailures?: number;
  invalidStreamRecords?: number;
  noWorkStarted: boolean;
  /** `start()` acceptance is ambiguous and this exact durable run may be retried safely. */
  acceptanceUncertain?: boolean;
  safeToRetry?: boolean;
  /** A Workflow id has been durably linked to this run. */
  handoffConfirmed?: boolean;
  /** Server-validated completion digest and expected manuscript artifacts exist. */
  completionArtifactsReady?: boolean;
  elapsedMs?: number;
  estimatedMinutes?: number;
  dispatchAttempts?: number;
  workflowMissingCount?: number;
  workflowMissingSince?: string | null;
  cancellation?: { requestedAt: string; reason: string | null } | null;
  pause?: {
    kind: "outline_approval" | "credits_topup" | "creative_decision";
    version: number;
    registeredAt: string;
    details?: {
      balanceCredits?: number;
      requiredCredits?: number;
      resumeStage?: string;
      questionId?: string;
    } | null;
  } | null;
  question?: CreativeQuestionForAuthor | null;
  savedChapterCount?: number;
  savedCheckpointCount?: number;
  supportReference?: string;
  rootErrorCode?: string | null;
  rootErrorStage?: string | null;
  chapters?: {
    total: number;
    planned: number;
    drafting: number;
    drafted: number;
    edited: number;
    final: number;
  };
};

export type RunStreamState = {
  stage: Stage;
  pct: number;
  detail?: string;
  pausedStage?: PausedStage;
  chapters: Map<number, ChapterProgress>;
  agentFeed: AgentFeedItem[];
  totalUsd: number;
  totalCredits: number;
  review?: { score: number; recommendation: string; issueCount: number };
  error?: { message: string; fatal: boolean };
  connection: RunConnection;
  health: RunHealth;
  connectionAttempt: number;
  lastConnectionError?: string;
};

export type RunStatus =
  "queued" | "running" | "awaiting_input" | "completed" | "failed" | "cancelled";

/** Page-load snapshot (run row + persisted progress events + DB chapter statuses). */
export type RunSnapshot = {
  run: {
    id: string;
    status: RunStatus;
    error: string | null;
    kind?: "full_book" | "chapter" | "edit_pass" | "continuity" | "export";
    workflowRunId?: string | null;
    createdAt?: string;
    startedAt?: string | null;
    completedAt?: string | null;
  };
  health?: Partial<RunHealth>;
  /** Persisted event payloads in seq order (validated here; invalid ones dropped). */
  events: unknown[];
  /** Chapter statuses read from the DB at render time. */
  chapters?: { number: number; status: ChapterStatus; wordCount?: number; qualityScore?: number }[];
  /** Metered spend for this run at render time. */
  totalUsd?: number;
  /** Actual usage debits for this run, in retail credits. */
  totalCredits?: number;
  /** Configuration-derived range, never a countdown or completion promise. */
  estimatedMinutes?: number;
};

const TERMINAL_STAGES: ReadonlySet<Stage> = new Set(["done", "failed", "cancelled"]);
const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set(["completed", "failed", "cancelled"]);
const RUN_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "running",
  "awaiting_input",
  "completed",
  "failed",
  "cancelled",
]);
const WORKFLOW_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "missing",
  "unavailable",
]);
const HEALTH_STATUSES = new Set(["healthy", "warning", "critical", "degraded"]);

/** Stages only move forward within a run; replay merges are upgrade-only. */
const STAGE_ORDER: Record<Stage, number> = {
  queued: 0,
  concept: 1,
  awaiting_guidance: 1,
  outline: 2,
  awaiting_approval: 3,
  bible: 4,
  chapters: 5,
  // A credit pause may happen before concept work or inside the chapter phase.
  // applyEvent handles entering and leaving it explicitly rather than relying
  // on this rank to infer where production resumes.
  awaiting_credits: 5,
  editing: 6,
  continuity: 7,
  revising: 8,
  finalizing: 9,
  done: 10,
  failed: 11,
  cancelled: 12,
};

const CHAPTER_ORDER: Record<ChapterStatus, number> = {
  planned: 0,
  drafting: 1,
  drafted: 2,
  edited: 3,
  final: 4,
};

const FEED_CAP = 100;

type Acc = {
  stage: Stage;
  pct: number;
  detail?: string;
  pausedStage?: PausedStage;
  chapters: Map<number, ChapterProgress>;
  agentFeed: AgentFeedItem[];
  feedSeq: number;
  totalUsd: number;
  totalCredits: number;
  review?: { score: number; recommendation: string; issueCount: number };
  error?: { message: string; fatal: boolean };
};

type HealthAcc = RunHealth & {
  connectionAttempt: number;
  lastConnectionError?: string;
};

function applyEvent(acc: Acc, event: RunEvent): void {
  switch (event.type) {
    case "stage": {
      // A credit pause can happen before concept work or between chapter
      // waves. Its rank therefore cannot describe the phase we resume into.
      // The next concrete stage event is authoritative.
      const resumingFromCredits =
        acc.stage === "awaiting_credits" && event.stage !== "awaiting_credits";
      if (
        event.stage === "awaiting_credits" ||
        resumingFromCredits ||
        STAGE_ORDER[event.stage] >= STAGE_ORDER[acc.stage]
      ) {
        acc.stage = event.stage;
        acc.detail = event.detail;
        acc.pausedStage = event.stage === "awaiting_credits" ? event.resumeStage : undefined;
      }
      acc.pct = Math.max(acc.pct, event.pct);
      if (event.stage === "done") {
        for (const [n, ch] of acc.chapters) {
          acc.chapters.set(n, { ...ch, status: "final" });
        }
      }
      break;
    }
    case "chapter": {
      const prev = acc.chapters.get(event.chapterNumber);
      const upgraded = !prev || CHAPTER_ORDER[event.status] >= CHAPTER_ORDER[prev.status];
      acc.chapters.set(event.chapterNumber, {
        status: upgraded ? event.status : (prev?.status ?? event.status),
        wordCount: event.wordCount ?? prev?.wordCount,
        qualityScore: event.qualityScore ?? prev?.qualityScore,
      });
      break;
    }
    case "agent": {
      acc.feedSeq += 1;
      acc.agentFeed.push({
        id: acc.feedSeq,
        agent: event.agent,
        message: event.message,
        chapterNumber: event.chapterNumber,
      });
      if (acc.agentFeed.length > FEED_CAP) {
        acc.agentFeed.splice(0, acc.agentFeed.length - FEED_CAP);
      }
      break;
    }
    case "cost": {
      // Cost events carry the cumulative run total; never regress a fresher DB seed.
      acc.totalUsd = Math.max(acc.totalUsd, event.totalUsd);
      acc.totalCredits = Math.max(
        acc.totalCredits,
        event.totalCredits ?? creditsForUsd(event.totalUsd),
      );
      break;
    }
    case "review": {
      acc.review = {
        score: event.score,
        recommendation: event.recommendation,
        issueCount: event.issueCount,
      };
      break;
    }
    case "error": {
      acc.error = { message: event.message, fatal: event.fatal };
      break;
    }
  }
}

function applyRunStatus(acc: Acc, status: RunStatus, error: string | null): void {
  switch (status) {
    case "completed":
      applyEvent(acc, { type: "stage", stage: "done", pct: 100 });
      break;
    case "failed":
      acc.stage = "failed";
      acc.error ??= { message: error ?? "Generation failed", fatal: true };
      break;
    case "cancelled":
      acc.stage = "cancelled";
      break;
    case "awaiting_input":
      if (
        acc.stage !== "awaiting_guidance" &&
        STAGE_ORDER[acc.stage] < STAGE_ORDER.awaiting_approval
      ) {
        acc.stage = "awaiting_approval";
      }
      break;
    default:
      break;
  }
}

function runStatus(value: unknown): RunStatus | undefined {
  return typeof value === "string" && RUN_STATUSES.has(value) ? (value as RunStatus) : undefined;
}

function workflowStatus(value: unknown): WorkflowStatus | undefined {
  return typeof value === "string" && WORKFLOW_STATUSES.has(value)
    ? (value as WorkflowStatus)
    : undefined;
}

function dateString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

function chapterCounts(value: unknown): RunHealth["chapters"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const counts = value as Record<string, unknown>;
  const fields = ["total", "planned", "drafting", "drafted", "edited", "final"] as const;
  if (
    !fields.every(
      (field) =>
        typeof counts[field] === "number" &&
        Number.isInteger(counts[field]) &&
        (counts[field] as number) >= 0,
    )
  ) {
    return undefined;
  }
  return Object.fromEntries(fields.map((field) => [field, counts[field]])) as NonNullable<
    RunHealth["chapters"]
  >;
}

function pauseState(value: unknown): RunHealth["pause"] | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const pause = value as Record<string, unknown>;
  if (
    (pause.kind !== "outline_approval" &&
      pause.kind !== "credits_topup" &&
      pause.kind !== "creative_decision") ||
    typeof pause.version !== "number" ||
    !Number.isInteger(pause.version) ||
    pause.version < 1
  ) {
    return undefined;
  }
  const registeredAt = dateString(pause.registeredAt);
  if (!registeredAt) return undefined;
  const rawDetails =
    pause.details && typeof pause.details === "object"
      ? (pause.details as Record<string, unknown>)
      : null;
  const details = rawDetails
    ? {
        ...(typeof rawDetails.balanceCredits === "number"
          ? { balanceCredits: rawDetails.balanceCredits }
          : {}),
        ...(typeof rawDetails.requiredCredits === "number"
          ? { requiredCredits: rawDetails.requiredCredits }
          : {}),
        ...(typeof rawDetails.resumeStage === "string"
          ? { resumeStage: rawDetails.resumeStage }
          : {}),
        ...(typeof rawDetails.questionId === "string" ? { questionId: rawDetails.questionId } : {}),
      }
    : null;
  return {
    kind: pause.kind,
    version: pause.version,
    registeredAt,
    details,
  };
}

function creativeQuestionState(value: unknown): CreativeQuestionForAuthor | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const question = value as Record<string, unknown>;
  if (
    typeof question.id !== "string" ||
    question.questionKey !== "after_concept" ||
    typeof question.question !== "string" ||
    typeof question.rationale !== "string" ||
    typeof question.decisionDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(question.decisionDigest) ||
    !Array.isArray(question.options) ||
    question.options.length !== 3 ||
    typeof question.recommendedOptionId !== "string"
  ) {
    return undefined;
  }
  const options = question.options.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const option = value as Record<string, unknown>;
    return typeof option.id === "string" &&
      ["option-1", "option-2", "option-3"].includes(option.id) &&
      typeof option.label === "string" &&
      typeof option.description === "string"
      ? [{ id: option.id, label: option.label, description: option.description }]
      : [];
  });
  if (
    options.length !== 3 ||
    new Set(options.map((option) => option.id)).size !== 3 ||
    !options.some((option) => option.id === question.recommendedOptionId)
  ) {
    return undefined;
  }
  return {
    id: question.id,
    questionKey: "after_concept",
    question: question.question,
    rationale: question.rationale,
    decisionDigest: question.decisionDigest,
    options: options as CreativeQuestionForAuthor["options"],
    recommendedOptionId:
      question.recommendedOptionId as CreativeQuestionForAuthor["recommendedOptionId"],
  };
}

/**
 * Defensive adapter for the enriched run endpoint. During rollout the page
 * snapshot and API may not gain every health field in the same deployment.
 */
export function parseRunHealthResponse(
  value: unknown,
  previous: RunHealth,
): {
  health: RunHealth;
  error: string | null;
  stage?: Stage;
  pct?: number;
  detail?: string;
  totalUsd?: number;
  totalCredits?: number;
} | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const run =
    root.run && typeof root.run === "object" ? (root.run as Record<string, unknown>) : undefined;
  const rawHealth =
    root.health && typeof root.health === "object"
      ? (root.health as Record<string, unknown>)
      : undefined;
  const databaseStatus =
    runStatus(rawHealth?.databaseStatus) ?? runStatus(run?.status) ?? previous.databaseStatus;
  const effectiveStatus =
    runStatus(rawHealth?.effectiveStatus) ?? runStatus(run?.status) ?? previous.effectiveStatus;

  const next: RunHealth = {
    databaseStatus,
    effectiveStatus,
    noWorkStarted:
      typeof rawHealth?.noWorkStarted === "boolean"
        ? rawHealth.noWorkStarted
        : previous.noWorkStarted,
    acceptanceUncertain:
      typeof rawHealth?.acceptanceUncertain === "boolean"
        ? rawHealth.acceptanceUncertain
        : previous.acceptanceUncertain,
    safeToRetry:
      typeof rawHealth?.safeToRetry === "boolean" ? rawHealth.safeToRetry : previous.safeToRetry,
    handoffConfirmed:
      (typeof run?.workflowRunId === "string" && run.workflowRunId.length > 0) ||
      Boolean(previous.handoffConfirmed),
    completionArtifactsReady:
      typeof rawHealth?.completionArtifactsReady === "boolean"
        ? rawHealth.completionArtifactsReady
        : previous.completionArtifactsReady,
    ...((workflowStatus(rawHealth?.workflowStatus) ?? previous.workflowStatus)
      ? { workflowStatus: workflowStatus(rawHealth?.workflowStatus) ?? previous.workflowStatus }
      : {}),
    ...((dateString(rawHealth?.acceptedAt) ?? dateString(run?.createdAt) ?? previous.acceptedAt)
      ? {
          acceptedAt:
            dateString(rawHealth?.acceptedAt) ?? dateString(run?.createdAt) ?? previous.acceptedAt,
        }
      : {}),
    ...((dateString(rawHealth?.startedAt) ?? dateString(run?.startedAt) ?? previous.startedAt)
      ? {
          startedAt:
            dateString(rawHealth?.startedAt) ?? dateString(run?.startedAt) ?? previous.startedAt,
        }
      : {}),
    ...((dateString(rawHealth?.completedAt) ?? dateString(run?.completedAt) ?? previous.completedAt)
      ? {
          completedAt:
            dateString(rawHealth?.completedAt) ??
            dateString(run?.completedAt) ??
            previous.completedAt,
        }
      : {}),
    ...((dateString(rawHealth?.lastEventAt) ??
    dateString(rawHealth?.lastUpdateAt) ??
    previous.lastEventAt)
      ? {
          lastEventAt:
            dateString(rawHealth?.lastEventAt) ??
            dateString(rawHealth?.lastUpdateAt) ??
            previous.lastEventAt,
        }
      : {}),
    ...((dateString(rawHealth?.heartbeatAt) ?? previous.heartbeatAt)
      ? { heartbeatAt: dateString(rawHealth?.heartbeatAt) ?? previous.heartbeatAt }
      : {}),
    ...((dateString(rawHealth?.lastUpdateAt) ?? previous.lastUpdateAt)
      ? { lastUpdateAt: dateString(rawHealth?.lastUpdateAt) ?? previous.lastUpdateAt }
      : {}),
    ...((
      typeof rawHealth?.health === "string" && HEALTH_STATUSES.has(rawHealth.health)
        ? rawHealth.health
        : previous.health
    )
      ? {
          health:
            typeof rawHealth?.health === "string" && HEALTH_STATUSES.has(rawHealth.health)
              ? (rawHealth.health as NonNullable<RunHealth["health"]>)
              : previous.health,
        }
      : {}),
    telemetryDegraded: false,
    consecutiveHealthFailures: 0,
    ...(typeof rawHealth?.elapsedMs === "number" &&
    Number.isFinite(rawHealth.elapsedMs) &&
    rawHealth.elapsedMs >= 0
      ? { elapsedMs: rawHealth.elapsedMs }
      : previous.elapsedMs !== undefined
        ? { elapsedMs: previous.elapsedMs }
        : {}),
    ...(typeof rawHealth?.estimatedMinutes === "number" &&
    Number.isFinite(rawHealth.estimatedMinutes) &&
    rawHealth.estimatedMinutes > 0
      ? { estimatedMinutes: rawHealth.estimatedMinutes }
      : previous.estimatedMinutes !== undefined
        ? { estimatedMinutes: previous.estimatedMinutes }
        : {}),
    ...((chapterCounts(rawHealth?.chapters) ?? previous.chapters)
      ? { chapters: chapterCounts(rawHealth?.chapters) ?? previous.chapters }
      : {}),
    ...(typeof rawHealth?.dispatchAttempts === "number"
      ? { dispatchAttempts: rawHealth.dispatchAttempts }
      : previous.dispatchAttempts !== undefined
        ? { dispatchAttempts: previous.dispatchAttempts }
        : {}),
    ...(typeof rawHealth?.workflowMissingCount === "number"
      ? { workflowMissingCount: rawHealth.workflowMissingCount }
      : previous.workflowMissingCount !== undefined
        ? { workflowMissingCount: previous.workflowMissingCount }
        : {}),
    ...(rawHealth && "workflowMissingSince" in rawHealth
      ? { workflowMissingSince: dateString(rawHealth.workflowMissingSince) ?? null }
      : previous.workflowMissingSince !== undefined
        ? { workflowMissingSince: previous.workflowMissingSince }
        : {}),
    ...(typeof rawHealth?.savedChapterCount === "number"
      ? { savedChapterCount: rawHealth.savedChapterCount }
      : previous.savedChapterCount !== undefined
        ? { savedChapterCount: previous.savedChapterCount }
        : {}),
    ...(typeof rawHealth?.savedCheckpointCount === "number"
      ? { savedCheckpointCount: rawHealth.savedCheckpointCount }
      : previous.savedCheckpointCount !== undefined
        ? { savedCheckpointCount: previous.savedCheckpointCount }
        : {}),
    ...(typeof rawHealth?.supportReference === "string"
      ? { supportReference: rawHealth.supportReference }
      : previous.supportReference
        ? { supportReference: previous.supportReference }
        : {}),
    ...(rawHealth && "rootErrorCode" in rawHealth
      ? {
          rootErrorCode:
            typeof rawHealth.rootErrorCode === "string" ? rawHealth.rootErrorCode : null,
        }
      : previous.rootErrorCode !== undefined
        ? { rootErrorCode: previous.rootErrorCode }
        : {}),
    ...(rawHealth && "rootErrorStage" in rawHealth
      ? {
          rootErrorStage:
            typeof rawHealth.rootErrorStage === "string" ? rawHealth.rootErrorStage : null,
        }
      : previous.rootErrorStage !== undefined
        ? { rootErrorStage: previous.rootErrorStage }
        : {}),
    ...(rawHealth && "cancellation" in rawHealth
      ? {
          cancellation:
            rawHealth.cancellation &&
            typeof rawHealth.cancellation === "object" &&
            typeof (rawHealth.cancellation as Record<string, unknown>).requestedAt === "string"
              ? {
                  requestedAt: (rawHealth.cancellation as Record<string, unknown>)
                    .requestedAt as string,
                  reason:
                    typeof (rawHealth.cancellation as Record<string, unknown>).reason === "string"
                      ? ((rawHealth.cancellation as Record<string, unknown>).reason as string)
                      : null,
                }
              : null,
        }
      : previous.cancellation !== undefined
        ? { cancellation: previous.cancellation }
        : {}),
    ...(rawHealth && "pause" in rawHealth
      ? {
          pause:
            rawHealth.pause === null
              ? null
              : (pauseState(rawHealth.pause) ?? previous.pause ?? null),
        }
      : previous.pause !== undefined
        ? { pause: previous.pause }
        : {}),
    ...(rawHealth && "question" in rawHealth
      ? {
          question:
            rawHealth.question === null
              ? null
              : (creativeQuestionState(rawHealth.question) ?? previous.question ?? null),
        }
      : previous.question !== undefined
        ? { question: previous.question }
        : {}),
  };

  const spend =
    rawHealth?.spend && typeof rawHealth.spend === "object"
      ? (rawHealth.spend as Record<string, unknown>)
      : undefined;
  const rootTotalUsd =
    typeof root.totalUsd === "number" && Number.isFinite(root.totalUsd)
      ? root.totalUsd
      : typeof spend?.totalUsd === "number" && Number.isFinite(spend.totalUsd)
        ? spend.totalUsd
        : typeof spend?.meteredUsd === "number" && Number.isFinite(spend.meteredUsd)
          ? spend.meteredUsd
          : undefined;
  const rootTotalCredits =
    typeof root.totalCredits === "number" && Number.isFinite(root.totalCredits)
      ? root.totalCredits
      : typeof spend?.totalCredits === "number" && Number.isFinite(spend.totalCredits)
        ? spend.totalCredits
        : typeof spend?.creditsUsed === "number" && Number.isFinite(spend.creditsUsed)
          ? spend.creditsUsed
          : undefined;
  const reportedStage =
    typeof rawHealth?.stage === "string" && rawHealth.stage in STAGE_ORDER
      ? (rawHealth.stage as Stage)
      : undefined;
  const polledStage =
    next.pause?.kind === "creative_decision" && next.question ? "awaiting_guidance" : reportedStage;
  const progressPct =
    typeof rawHealth?.progressPct === "number" &&
    Number.isFinite(rawHealth.progressPct) &&
    rawHealth.progressPct >= 0
      ? Math.min(100, rawHealth.progressPct)
      : undefined;

  return {
    health: next,
    error: typeof run?.error === "string" ? run.error : null,
    ...(polledStage ? { stage: polledStage } : {}),
    ...(progressPct !== undefined ? { pct: progressPct } : {}),
    ...(typeof rawHealth?.stageDescription === "string"
      ? { detail: rawHealth.stageDescription }
      : {}),
    ...(rootTotalUsd !== undefined ? { totalUsd: rootTotalUsd } : {}),
    ...(rootTotalCredits !== undefined ? { totalCredits: rootTotalCredits } : {}),
  };
}

function eventShowsWork(event: RunEvent): boolean {
  if (event.type === "stage") return event.stage !== "queued";
  if (event.type === "cost") return event.totalUsd > 0;
  return event.type === "agent" || event.type === "chapter" || event.type === "review";
}

function initFromSnapshot(snapshot: RunSnapshot): Acc {
  const acc: Acc = {
    stage: "queued",
    pct: 0,
    chapters: new Map(
      (snapshot.chapters ?? []).map((c) => [
        c.number,
        { status: c.status, wordCount: c.wordCount, qualityScore: c.qualityScore },
      ]),
    ),
    agentFeed: [],
    feedSeq: 0,
    totalUsd: snapshot.totalUsd ?? 0,
    totalCredits: snapshot.totalCredits ?? creditsForUsd(snapshot.totalUsd ?? 0),
  };
  const terminalIsConfirmed = TERMINAL_STATUSES.has(
    snapshot.health?.effectiveStatus ?? snapshot.run.status,
  );
  for (const payload of snapshot.events) {
    const parsed = runEventSchema.safeParse(payload);
    if (
      parsed.success &&
      !(
        parsed.data.type === "stage" &&
        TERMINAL_STAGES.has(parsed.data.stage) &&
        !terminalIsConfirmed
      )
    ) {
      applyEvent(acc, parsed.data);
    }
  }
  const snapshotHealth = snapshot.health;
  const snapshotStage =
    snapshotHealth?.pause?.kind === "creative_decision" && snapshotHealth.question
      ? "awaiting_guidance"
      : snapshotHealth?.stage;
  if (snapshotStage) {
    const resumeStage = snapshotHealth?.pause?.details?.resumeStage;
    applyEvent(acc, {
      type: "stage",
      stage: snapshotStage,
      pct: snapshotHealth?.progressPct ?? acc.pct,
      ...(snapshotHealth?.stageDescription ? { detail: snapshotHealth.stageDescription } : {}),
      ...(snapshotStage === "awaiting_credits" &&
      resumeStage &&
      ["concept", "outline", "bible", "chapters", "editing", "continuity", "revising"].includes(
        resumeStage,
      )
        ? { resumeStage: resumeStage as PausedStage }
        : {}),
    });
  }
  applyRunStatus(acc, snapshot.health?.effectiveStatus ?? snapshot.run.status, snapshot.run.error);
  return acc;
}

function initHealthFromSnapshot(snapshot: RunSnapshot): HealthAcc {
  const persistedEvents = snapshot.events
    .map((payload) => runEventSchema.safeParse(payload))
    .filter((result) => result.success)
    .map((result) => result.data);
  const noWorkStarted =
    snapshot.health?.noWorkStarted ??
    !(
      persistedEvents.some(eventShowsWork) ||
      (snapshot.totalUsd ?? 0) > 0 ||
      (snapshot.chapters ?? []).some((chapter) => chapter.status !== "planned")
    );
  const databaseStatus = snapshot.health?.databaseStatus ?? snapshot.run.status;
  const effectiveStatus = snapshot.health?.effectiveStatus ?? snapshot.run.status;

  return {
    ...snapshot.health,
    databaseStatus,
    effectiveStatus,
    noWorkStarted,
    acceptanceUncertain: snapshot.health?.acceptanceUncertain,
    safeToRetry: snapshot.health?.safeToRetry,
    handoffConfirmed:
      Boolean(snapshot.run.workflowRunId) || snapshot.health?.handoffConfirmed === true,
    connectionAttempt: 0,
    ...(snapshot.health?.workflowStatus ? { workflowStatus: snapshot.health.workflowStatus } : {}),
    ...((snapshot.health?.acceptedAt ?? snapshot.run.createdAt)
      ? { acceptedAt: snapshot.health?.acceptedAt ?? snapshot.run.createdAt }
      : {}),
    ...((snapshot.health?.startedAt ?? snapshot.run.startedAt)
      ? { startedAt: snapshot.health?.startedAt ?? snapshot.run.startedAt ?? undefined }
      : {}),
    ...((snapshot.health?.completedAt ?? snapshot.run.completedAt)
      ? { completedAt: snapshot.health?.completedAt ?? snapshot.run.completedAt ?? undefined }
      : {}),
    ...(snapshot.health?.lastEventAt ? { lastEventAt: snapshot.health.lastEventAt } : {}),
    ...(snapshot.health?.elapsedMs !== undefined ? { elapsedMs: snapshot.health.elapsedMs } : {}),
    ...((snapshot.health?.estimatedMinutes ?? snapshot.estimatedMinutes)
      ? {
          estimatedMinutes: snapshot.health?.estimatedMinutes ?? snapshot.estimatedMinutes,
        }
      : {}),
    ...(snapshot.health?.chapters ? { chapters: snapshot.health.chapters } : {}),
  };
}

function materialize(acc: Acc, connection: RunConnection, health: HealthAcc): RunStreamState {
  const { connectionAttempt, lastConnectionError, ...healthState } = health;
  return {
    stage: acc.stage,
    pct: acc.pct,
    detail: acc.detail,
    pausedStage: acc.pausedStage,
    chapters: new Map(acc.chapters),
    agentFeed: [...acc.agentFeed],
    totalUsd: acc.totalUsd,
    totalCredits: acc.totalCredits,
    review: acc.review,
    error: acc.error,
    connection,
    health: {
      ...healthState,
      ...(health.chapters ? { chapters: { ...health.chapters } } : {}),
    },
    connectionAttempt,
    lastConnectionError,
  };
}

function backoffMs(attempt: number): number {
  return Math.min(10_000, 1_000 * 2 ** Math.min(attempt - 1, 3));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", done);
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

/**
 * Reads an NDJSON body, invoking onLine for every complete line. Returns when
 * the stream ends; throws on network failure.
 */
async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
  signal: AbortSignal,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  const cancelReader = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", cancelReader, { once: true });
  try {
    for (;;) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim().length > 0) onLine(line);
      }
    }
    if (buffer.trim().length > 0) onLine(buffer);
    completed = true;
  } finally {
    signal.removeEventListener("abort", cancelReader);
    if (signal.aborted || !completed) {
      await reader.cancel(signal.reason).catch(() => {});
    }
    reader.releaseLock();
  }
}

export type UseRunStreamResult = {
  state: RunStreamState;
  /**
   * Opens a resumable reader on the chapter's prose namespace. The listener
   * receives the full accumulated text after every delta batch. Returns an
   * unsubscribe function.
   */
  subscribeChapterProse: (chapterNumber: number, onText: (fullText: string) => void) => () => void;
  /** Locally reflect a durable cancellation request while confirmation is pending. */
  markCancelled: () => void;
  /** Immediately recheck authoritative run health after degraded telemetry. */
  checkHealth: () => Promise<void>;
};

export function useRunStream(runId: string, snapshot: RunSnapshot): UseRunStreamResult {
  const terminalAtMount = TERMINAL_STATUSES.has(
    snapshot.health?.effectiveStatus ?? snapshot.run.status,
  );

  // Computed once per mount (consumers key by runId): the mutable accumulator
  // and the state materialized from the server snapshot.
  const [initial] = React.useState<{
    acc: Acc;
    health: HealthAcc;
    connection: RunConnection;
    state: RunStreamState;
  }>(() => {
    const acc = initFromSnapshot(snapshot);
    const health = initHealthFromSnapshot(snapshot);
    const connection: RunConnection = TERMINAL_STATUSES.has(health.effectiveStatus)
      ? "ended"
      : "connecting";
    return { acc, health, connection, state: materialize(acc, connection, health) };
  });

  const accRef = React.useRef(initial.acc);
  const healthRef = React.useRef(initial.health);
  const connRef = React.useRef(initial.connection);
  const stoppedRef = React.useRef(false);
  const abortRef = React.useRef<(() => void) | null>(null);
  const healthRefreshRef = React.useRef<() => Promise<void>>(async () => {});

  const [state, setState] = React.useState<RunStreamState>(initial.state);

  const publish = React.useCallback((connection?: RunConnection) => {
    if (connection) connRef.current = connection;
    setState(materialize(accRef.current, connRef.current, healthRef.current));
  }, []);

  React.useEffect(() => {
    if (terminalAtMount) return;

    const controller = new AbortController();
    const { signal } = controller;
    abortRef.current = () => controller.abort();
    let received = 0;
    let attempt = 0;

    async function fetchRunHealth(): Promise<boolean> {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store", signal });
        if (!res.ok) throw new Error(`Health check responded ${res.status}`);
        const json: unknown = await res.json();
        const parsed = parseRunHealthResponse(json, healthRef.current);
        if (!parsed) throw new Error("Health check returned an invalid response");
        healthRef.current = {
          ...healthRef.current,
          ...parsed.health,
          telemetryDegraded: false,
          consecutiveHealthFailures: 0,
        };
        if (parsed.totalUsd !== undefined) {
          accRef.current.totalUsd = Math.max(accRef.current.totalUsd, parsed.totalUsd);
        }
        if (parsed.totalCredits !== undefined) {
          accRef.current.totalCredits = Math.max(accRef.current.totalCredits, parsed.totalCredits);
        }
        if (parsed.stage) {
          applyEvent(accRef.current, {
            type: "stage",
            stage: parsed.stage,
            pct: parsed.pct ?? accRef.current.pct,
            ...(parsed.detail ? { detail: parsed.detail } : {}),
          });
        } else if (parsed.pct !== undefined) {
          accRef.current.pct = Math.max(accRef.current.pct, parsed.pct);
        }
        applyRunStatus(accRef.current, parsed.health.effectiveStatus, parsed.error);
        if (TERMINAL_STATUSES.has(parsed.health.effectiveStatus)) {
          stoppedRef.current = true;
          publish("ended");
          controller.abort();
          return true;
        }
        publish();
        return false;
      } catch (error) {
        if (signal.aborted) return false;
        const failures = (healthRef.current.consecutiveHealthFailures ?? 0) + 1;
        healthRef.current.consecutiveHealthFailures = failures;
        if (failures >= 3) {
          healthRef.current.telemetryDegraded = true;
          healthRef.current.health = "degraded";
          healthRef.current.lastConnectionError =
            error instanceof Error ? error.message : "Run health is temporarily unavailable";
          publish("reconnecting");
        }
        return false;
      }
    }
    healthRefreshRef.current = async () => {
      await fetchRunHealth();
    };

    async function pollHealth() {
      while (!signal.aborted && !stoppedRef.current) {
        if (await fetchRunHealth()) return;
        await sleep(5_000, signal);
      }
    }

    async function run() {
      const acc = accRef.current;
      while (!signal.aborted && !stoppedRef.current) {
        publish(received > 0 || attempt > 0 ? "reconnecting" : "connecting");
        try {
          const res = await fetch(`/api/runs/${runId}/stream?ns=progress&startIndex=${received}`, {
            cache: "no-store",
            signal,
          });
          if (!res.ok || !res.body) throw new Error(`Stream responded ${res.status}`);
          attempt = 0;
          healthRef.current.connectionAttempt = 0;
          healthRef.current.lastConnectionError = undefined;
          if (received === 0) {
            // Full replay is about to arrive; rebuild the append-only feed from
            // events so snapshot-seeded entries are not duplicated.
            acc.agentFeed = [];
            acc.feedSeq = 0;
          }
          publish("live");

          let dirty = false;
          let terminalStageHint = false;
          await readNdjson(
            res.body,
            (line) => {
              received += 1;
              try {
                const parsed: unknown = JSON.parse(line);
                const event = runEventSchema.safeParse(parsed);
                if (event.success) {
                  if (event.data.type === "stage" && TERMINAL_STAGES.has(event.data.stage)) {
                    terminalStageHint = true;
                  } else {
                    applyEvent(acc, event.data);
                  }
                  healthRef.current.lastEventAt = new Date().toISOString();
                  if (eventShowsWork(event.data)) healthRef.current.noWorkStarted = false;
                  dirty = true;
                } else {
                  healthRef.current.invalidStreamRecords =
                    (healthRef.current.invalidStreamRecords ?? 0) + 1;
                  console.warn("Ignored invalid authoring stream record", {
                    runId,
                    issues: event.error.issues.length,
                  });
                  dirty = true;
                }
              } catch (error) {
                healthRef.current.invalidStreamRecords =
                  (healthRef.current.invalidStreamRecords ?? 0) + 1;
                console.warn("Ignored malformed authoring stream record", { runId, error });
                dirty = true;
              }
              if (dirty) {
                publish();
                dirty = false;
              }
            },
            signal,
          );

          // A stream event is only a hint. Confirm every apparent terminal
          // state against authoritative run health before ending.
          if (terminalStageHint || TERMINAL_STAGES.has(acc.stage)) {
            if (await fetchRunHealth()) return;
            throw new Error("Terminal stream event is not yet confirmed");
          }
          if (await fetchRunHealth()) return;
          throw new Error("Stream ended while the run was still active");
        } catch (cause) {
          if (signal.aborted || stoppedRef.current) return;
          attempt += 1;
          healthRef.current.connectionAttempt = attempt;
          healthRef.current.lastConnectionError =
            cause instanceof Error ? cause.message : "The live connection was interrupted";
          publish("reconnecting");
          if (await fetchRunHealth()) return;
          await sleep(backoffMs(attempt), signal);
        }
      }
    }

    void run();
    void pollHealth();
    return () => {
      controller.abort();
      abortRef.current = null;
      healthRefreshRef.current = async () => {};
    };
  }, [runId, terminalAtMount, publish]);

  const subscribeChapterProse = React.useCallback(
    (chapterNumber: number, onText: (fullText: string) => void) => {
      const controller = new AbortController();
      const { signal } = controller;
      let received = 0;
      let text = "";

      async function convergeFromSavedChapter(): Promise<
        "saved" | "terminal_unsaved" | "active_unsaved" | "unavailable"
      > {
        try {
          const saved = await fetch(`/api/runs/${runId}/chapters/${chapterNumber}`, {
            cache: "no-store",
            signal,
          });
          if (!saved.ok) return "unavailable";
          const authoritative: unknown = await saved.json();
          if (!authoritative || typeof authoritative !== "object") return "unavailable";
          const record = authoritative as Record<string, unknown>;
          if (record.saved === true && typeof record.content === "string") {
            text = record.content;
            if (!signal.aborted) onText(text);
            return "saved";
          }
          if (
            typeof record.runStatus === "string" &&
            TERMINAL_STATUSES.has(record.runStatus as RunStatus)
          ) {
            return "terminal_unsaved";
          }
          return "active_unsaved";
        } catch {
          return "unavailable";
        }
      }

      async function run() {
        let attempt = 0;
        const namespace = encodeURIComponent(`chapter:${chapterNumber}`);

        // A reload can discover a durably saved chapter from the page snapshot
        // even when its Workflow stream is unavailable or remains open for the
        // rest of an active book run. Prefer the manuscript row immediately.
        const initialStatus = accRef.current.chapters.get(chapterNumber)?.status;
        if (initialStatus && initialStatus !== "planned" && initialStatus !== "drafting") {
          const initial = await convergeFromSavedChapter();
          if (initial === "saved" || initial === "terminal_unsaved") return;
        }

        while (!signal.aborted) {
          let convergence: Awaited<ReturnType<typeof convergeFromSavedChapter>> | undefined;
          try {
            const res = await fetch(
              `/api/runs/${runId}/stream?ns=${namespace}&startIndex=${received}`,
              { cache: "no-store", signal },
            );
            if (!res.ok || !res.body) throw new Error(`Prose stream responded ${res.status}`);
            attempt = 0;

            let dirty = false;
            await readNdjson(
              res.body,
              (line) => {
                received += 1;
                try {
                  const delta: unknown = JSON.parse(line);
                  if (typeof delta === "string") {
                    if (delta.length > 0) {
                      text += delta;
                      dirty = true;
                    }
                  } else {
                    healthRef.current.invalidStreamRecords =
                      (healthRef.current.invalidStreamRecords ?? 0) + 1;
                    console.warn("Ignored invalid chapter stream record", {
                      runId,
                      chapterNumber,
                    });
                    publish();
                  }
                } catch (error) {
                  healthRef.current.invalidStreamRecords =
                    (healthRef.current.invalidStreamRecords ?? 0) + 1;
                  console.warn("Ignored malformed chapter stream record", {
                    runId,
                    chapterNumber,
                    error,
                  });
                  publish();
                }
                if (dirty && !signal.aborted) {
                  onText(text);
                  dirty = false;
                }
              },
              signal,
            );
            convergence = await convergeFromSavedChapter();
            if (convergence === "saved" || convergence === "terminal_unsaved") return;
            throw new Error("Chapter stream ended before the chapter was saved");
          } catch {
            if (signal.aborted) return;
            // Stream transport is never the manuscript authority. A failed
            // stream may coincide with a successful chapter commit, so check
            // the saved row before entering another reconnect delay.
            const recovered = convergence ?? (await convergeFromSavedChapter());
            if (recovered === "saved" || recovered === "terminal_unsaved") return;
            attempt += 1;
            await sleep(backoffMs(attempt), signal);
          }
        }
      }

      void run();
      return () => controller.abort();
    },
    [publish, runId],
  );

  const markCancelled = React.useCallback(() => {
    healthRef.current.cancellation = {
      requestedAt: new Date().toISOString(),
      reason: "Cancelled by author",
    };
    healthRef.current.health = "warning";
    accRef.current.detail = "Stopping safely";
    publish("live");
  }, [publish]);

  const checkHealth = React.useCallback(async () => {
    await healthRefreshRef.current();
  }, []);

  return { state, subscribeChapterProse, markCancelled, checkHealth };
}

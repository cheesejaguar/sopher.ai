import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDb, schema } from "@/db";
import {
  authoringJourneyRunPrioritySql,
  getChapterList,
  getLatestAuthoringJourneyRun,
  getLatestOutline,
  getProjectWithBook,
} from "@/db/queries/books";
import { listProjectsWithStats, type ProjectWithStats } from "@/db/queries/projects";
import {
  deriveAuthoringJourney,
  type AuthoringJourneyArtifacts,
  type AuthoringJourneyHealth,
  type AuthoringJourneyRun,
  type AuthoringJourneySnapshot,
} from "@/lib/authoring-journey";
import { creditsForUsd } from "@/lib/billing/credits-shared";
import { getBalance } from "@/lib/billing/credits";
import { deriveAuthoringRunAcceptanceState, type AuthoringRunStatus } from "@/lib/generation-runs";
import {
  canonicalRunProgress,
  classifyRunHealth,
  countSavedAuthoringCheckpoints,
  generationEstimate,
  getRunHealth,
  type WorkflowHealthStatus,
} from "@/lib/run-health";
import { requiresRunOwnedFullBookCompletionProof } from "@/lib/run-completion-proof";
import { runEventSchema, type GenerationConfig, type Stage } from "@/lib/run-events";
import { getStudioAccess, type StudioAccess } from "@/lib/studio-access";

type JourneyAccess = Pick<StudioAccess, "fullBookUnlocked"> & {
  balanceCredits?: number;
};
type ProjectData = NonNullable<Awaited<ReturnType<typeof getProjectWithBook>>>;
type ChapterList = Awaited<ReturnType<typeof getChapterList>>;

type PersistedRun = Pick<
  typeof schema.generationRuns.$inferSelect,
  | "id"
  | "projectId"
  | "userId"
  | "workflowRunId"
  | "kind"
  | "status"
  | "config"
  | "error"
  | "startedAt"
  | "completedAt"
  | "acceptanceUncertainAt"
  | "acceptanceDispatchClaimedAt"
  | "healthCheckedAt"
  | "createdAt"
  | "currentStage"
  | "progressPct"
  | "stageDescription"
  | "lastProgressAt"
  | "heartbeatAt"
  | "workflowObservedStatus"
  | "workflowObservedAt"
  | "dispatchAttempts"
  | "cancellationRequestedAt"
  | "pauseKind"
  | "pauseVersion"
  | "pauseDetails"
  | "rootErrorCode"
  | "rootErrorStage"
  | "supportReference"
>;

type StageEventRow = {
  runId: string;
  payload: unknown;
  createdAt: Date;
};

function toIso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

export function classifyPersistedJourneyHealth(input: {
  status: PersistedRun["status"];
  workflowStatus: WorkflowHealthStatus | null;
  stage: Stage;
  acceptedAt: Date;
  lastUpdateAt: Date;
  cancellationRequestedAt: Date | null;
  config: unknown;
  progressPct: number;
  now?: Date;
}): AuthoringJourneyHealth {
  if (input.status === "completed" || input.stage === "done") return "complete";
  if (
    input.status === "failed" ||
    input.status === "cancelled" ||
    input.stage === "failed" ||
    input.stage === "cancelled"
  ) {
    return "needs_attention";
  }
  if (input.stage === "awaiting_approval" || input.stage === "awaiting_credits") {
    return "waiting";
  }
  const estimateMinutes = generationEstimate(input.config as Partial<GenerationConfig>);
  const remainingEstimateMs =
    estimateMinutes === null
      ? null
      : estimateMinutes * 60_000 * Math.max(0, 1 - input.progressPct / 100);
  const health = classifyRunHealth({
    databaseStatus: input.status,
    workflowStatus: input.workflowStatus ?? "pending",
    acceptedAt: input.acceptedAt,
    lastUpdateAt: input.lastUpdateAt,
    cancellationRequestedAt: input.cancellationRequestedAt,
    remainingEstimateMs,
    now: input.now,
  });
  if (health === "critical") return "needs_attention";
  if (health === "warning" || health === "degraded") return "degraded";
  return input.status === "queued" ? "waiting" : "healthy";
}

function latestStageForRun(
  run: PersistedRun,
  stageEvent?: StageEventRow,
): {
  stage: Stage;
  progressPct: number;
  stageDescription: string | null;
  lastEventAt: Date | null;
} {
  const parsed = runEventSchema.safeParse(stageEvent?.payload);
  const legacyStage = parsed.success && parsed.data.type === "stage" ? parsed.data : null;
  const projection = canonicalRunProgress({
    effectiveStatus: run.status as AuthoringRunStatus,
    persisted: {
      stage: run.currentStage,
      progressPct: run.progressPct,
      stageDescription: run.stageDescription,
      lastProgressAt: run.lastProgressAt,
    },
    event: legacyStage
      ? {
          stage: legacyStage.stage,
          progressPct: legacyStage.pct,
          stageDescription: legacyStage.detail ?? null,
          createdAt: stageEvent?.createdAt ?? null,
        }
      : {
          stage: "queued",
          progressPct: 0,
          stageDescription: null,
          createdAt: null,
        },
  });
  return {
    ...projection,
    lastEventAt: stageEvent?.createdAt ?? null,
  };
}

function blockingRecoveryEvidence(input: {
  error: string | null;
  incidentCategories?: string[];
}): string[] {
  const categories = new Set(input.incidentCategories ?? []);
  const error = input.error?.toLowerCase() ?? "";
  if (
    error.includes("unresolved local metering") ||
    error.includes("reconciliation is required") ||
    (error.includes("already settled") && error.includes("checkpoint is missing"))
  ) {
    categories.add("unresolved_metering");
  }
  return [...categories];
}

function persistedRunToJourney(input: {
  run: PersistedRun;
  stageEvent?: StageEventRow;
  artifacts: AuthoringJourneyArtifacts;
  projectSpendUsd: number;
  projectCompletedAt: Date | null;
  blockingIncidentCategories?: string[];
  workflow?: {
    databaseStatus: AuthoringJourneyRun["databaseStatus"];
    workflowStatus: AuthoringJourneyRun["workflowStatus"];
    effectiveStatus: AuthoringJourneyRun["effectiveStatus"];
    acceptedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    lastUpdateAt: string;
    stage: Stage;
    progressPct: number;
    stageDescription: string | null;
    authoringBegan: boolean;
    noWorkStarted: boolean;
    completionArtifactsReady: boolean;
    acceptanceUncertain: boolean;
    safeToRetry: boolean;
    spend: AuthoringJourneyRun["spend"];
    heartbeatAt: string | null;
    health: AuthoringJourneyHealth;
    dispatchAttempts: number;
    cancellation: {
      requestedAt: string;
      reason: string | null;
    } | null;
    pause: {
      kind: "outline_approval" | "credits_topup";
      version: number;
      details: {
        balanceCredits?: number;
        requiredCredits?: number;
        resumeStage?: string;
      } | null;
    } | null;
    supportReference: string;
  };
}): AuthoringJourneyRun {
  const persisted = latestStageForRun(input.run, input.stageEvent);
  const acceptance = deriveAuthoringRunAcceptanceState({
    acceptanceUncertainAt: input.run.acceptanceUncertainAt,
    acceptanceDispatchClaimedAt: input.run.acceptanceDispatchClaimedAt,
  });
  const lastUpdateAt =
    input.run.heartbeatAt ??
    input.run.lastProgressAt ??
    persisted.lastEventAt ??
    input.run.completedAt ??
    input.run.startedAt ??
    input.run.createdAt;
  const authoringBegan =
    input.workflow?.authoringBegan ??
    (persisted.stage !== "queued" ||
      input.artifacts.savedChapters > 0 ||
      input.projectSpendUsd > 0);
  const databaseStatus = input.workflow?.databaseStatus ?? input.run.status;
  const workflowStatus = input.workflow?.workflowStatus ?? input.run.workflowObservedStatus ?? null;
  const runConfig = input.run.config as Partial<GenerationConfig>;
  const finalized = runConfig.completion?.finalized;
  const requiresWholeBookCompletionProof = input.run.kind === "full_book";
  const expectedChapterCount =
    typeof runConfig.targetChapters === "number" &&
    Number.isInteger(runConfig.targetChapters) &&
    runConfig.targetChapters > 0
      ? runConfig.targetChapters
      : input.artifacts.totalChapters;
  const requiresRunOwnedFinalization = requiresRunOwnedFullBookCompletionProof(runConfig);
  const completionArtifactsReady =
    input.workflow?.completionArtifactsReady ??
    (requiresWholeBookCompletionProof &&
      databaseStatus === "completed" &&
      input.projectCompletedAt !== null &&
      expectedChapterCount > 0 &&
      input.artifacts.finalChapters >= expectedChapterCount &&
      (!requiresRunOwnedFinalization ||
        (finalized?.sourceRunId === input.run.id &&
          typeof finalized.manuscriptDigest === "string" &&
          finalized.manuscriptDigest.length > 0)));
  const effectiveStatus =
    input.workflow?.effectiveStatus ??
    (workflowStatus === "failed" || workflowStatus === "cancelled"
      ? workflowStatus
      : workflowStatus === "completed" &&
          requiresWholeBookCompletionProof &&
          !completionArtifactsReady
        ? "failed"
        : input.run.status);
  const stage = input.workflow?.stage ?? persisted.stage;
  const progressPct = input.workflow?.progressPct ?? persisted.progressPct;
  const stageDescription = input.workflow?.stageDescription ?? persisted.stageDescription;
  const runLastUpdateAt = input.workflow?.lastUpdateAt ?? lastUpdateAt.toISOString();
  const health =
    stage === "awaiting_approval" || stage === "awaiting_credits"
      ? "waiting"
      : (input.workflow?.health ??
        classifyPersistedJourneyHealth({
          status: effectiveStatus,
          workflowStatus,
          stage,
          acceptedAt: input.run.createdAt,
          lastUpdateAt: new Date(runLastUpdateAt),
          cancellationRequestedAt: input.run.cancellationRequestedAt,
          config: input.run.config,
          progressPct,
        }));
  return {
    id: input.run.id,
    kind: input.run.kind === "export" ? undefined : input.run.kind,
    databaseStatus,
    workflowStatus,
    effectiveStatus,
    stage,
    progressPct,
    stageDescription,
    acceptedAt: input.workflow?.acceptedAt ?? input.run.createdAt.toISOString(),
    startedAt: input.workflow?.startedAt ?? toIso(input.run.startedAt),
    completedAt: input.workflow?.completedAt ?? toIso(input.run.completedAt),
    lastUpdateAt: runLastUpdateAt,
    acceptanceUncertain:
      input.workflow?.acceptanceUncertain ??
      (input.run.status === "queued" && !input.run.workflowRunId && acceptance.acceptanceUncertain),
    safeToRetry: input.workflow?.safeToRetry ?? acceptance.safeToRetry,
    authoringBegan,
    noWorkStarted: input.workflow?.noWorkStarted ?? !authoringBegan,
    completionArtifactsReady,
    heartbeatAt: input.workflow?.heartbeatAt ?? toIso(input.run.heartbeatAt),
    lastProgressAt: toIso(input.run.lastProgressAt),
    workflowObservedAt: toIso(input.run.workflowObservedAt),
    dispatchAttempts: input.workflow?.dispatchAttempts ?? input.run.dispatchAttempts,
    rootErrorCode: input.run.rootErrorCode,
    rootErrorStage: input.run.rootErrorStage,
    blockingIncidentCategories: blockingRecoveryEvidence({
      error: input.run.error,
      incidentCategories: input.blockingIncidentCategories,
    }),
    supportReference: input.workflow?.supportReference ?? input.run.supportReference,
    cancellationRequestedAt:
      input.workflow?.cancellation?.requestedAt ?? toIso(input.run.cancellationRequestedAt),
    pause: input.workflow?.pause
      ? {
          kind: input.workflow.pause.kind === "credits_topup" ? "credits" : "outline_approval",
          version: input.workflow.pause.version,
          ...input.workflow.pause.details,
        }
      : input.run.pauseKind === "outline_approval"
        ? {
            kind: "outline_approval",
            version: input.run.pauseVersion,
            ...input.run.pauseDetails,
          }
        : input.run.pauseKind === "credits_topup"
          ? {
              kind: "credits",
              version: input.run.pauseVersion,
              ...input.run.pauseDetails,
            }
          : stage === "awaiting_approval"
            ? { kind: "outline_approval" }
            : stage === "awaiting_credits"
              ? { kind: "credits" }
              : null,
    health,
    spend: input.workflow?.spend ?? {
      meteredUsd: input.projectSpendUsd,
      creditsUsed: creditsForUsd(input.projectSpendUsd),
      scope: "project",
    },
  };
}

function artifactsFromProject(
  project: ProjectWithStats,
  savedCheckpoints: number,
): AuthoringJourneyArtifacts {
  return {
    briefReady: Boolean(project.brief?.trim() && project.title.trim()),
    bookReady: project.bookId !== null,
    fullBookCompletionReady: project.fullBookCompletionReady,
    outlineReady: project.outlineReady,
    savedChapters: project.savedChapters,
    savedCheckpoints,
    editedChapters: project.editedChapters,
    finalChapters: project.finalChapters,
    totalChapters: project.chaptersTotal,
    wordCount: project.wordCount,
  };
}

function projectSeed(project: ProjectWithStats): AuthoringJourneySnapshot["project"] & {
  brief: string | null;
  completedAt: string | null;
} {
  return {
    id: project.id,
    title: project.title,
    genre: project.genre,
    status: project.status,
    experience: project.experience,
    updatedAt: project.updatedAt.toISOString(),
    targetChapters: project.targetChapters,
    targetWordsPerChapter: project.targetWordsPerChapter,
    qualityTier: project.settings.qualityTier ?? "standard",
    brief: project.brief,
    completedAt: toIso(project.completedAt),
  };
}

async function readJourneyRuns(projectIds: string[]): Promise<PersistedRun[]> {
  if (projectIds.length === 0) return [];
  return getDb()
    .selectDistinctOn([schema.generationRuns.projectId], {
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
      currentStage: schema.generationRuns.currentStage,
      progressPct: schema.generationRuns.progressPct,
      stageDescription: schema.generationRuns.stageDescription,
      lastProgressAt: schema.generationRuns.lastProgressAt,
      heartbeatAt: schema.generationRuns.heartbeatAt,
      workflowObservedStatus: schema.generationRuns.workflowObservedStatus,
      workflowObservedAt: schema.generationRuns.workflowObservedAt,
      dispatchAttempts: schema.generationRuns.dispatchAttempts,
      cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
      pauseKind: schema.generationRuns.pauseKind,
      pauseVersion: schema.generationRuns.pauseVersion,
      pauseDetails: schema.generationRuns.pauseDetails,
      rootErrorCode: schema.generationRuns.rootErrorCode,
      rootErrorStage: schema.generationRuns.rootErrorStage,
      supportReference: schema.generationRuns.supportReference,
    })
    .from(schema.generationRuns)
    .where(
      and(
        inArray(schema.generationRuns.projectId, projectIds),
        inArray(schema.generationRuns.kind, ["full_book", "chapter", "edit_pass", "continuity"]),
      ),
    )
    .orderBy(
      schema.generationRuns.projectId,
      authoringJourneyRunPrioritySql(),
      desc(schema.generationRuns.createdAt),
    );
}

async function readLatestStageEvents(runIds: string[]): Promise<StageEventRow[]> {
  if (runIds.length === 0) return [];
  return getDb()
    .selectDistinctOn([schema.generationEvents.runId], {
      runId: schema.generationEvents.runId,
      payload: schema.generationEvents.payload,
      createdAt: schema.generationEvents.createdAt,
    })
    .from(schema.generationEvents)
    .where(
      and(
        inArray(schema.generationEvents.runId, runIds),
        eq(schema.generationEvents.type, "stage"),
      ),
    )
    .orderBy(schema.generationEvents.runId, desc(schema.generationEvents.seq));
}

async function readBlockingIncidentCategories(
  runIds: string[],
): Promise<Array<{ runId: string; category: string }>> {
  if (runIds.length === 0) return [];
  return getDb()
    .select({
      runId: schema.authoringIncidents.runId,
      category: schema.authoringIncidents.category,
    })
    .from(schema.authoringIncidents)
    .where(
      and(
        inArray(schema.authoringIncidents.runId, runIds),
        isNull(schema.authoringIncidents.resolvedAt),
        inArray(schema.authoringIncidents.category, [
          "completion_contradiction",
          "event_persistence",
          "invalid_pause",
        ]),
      ),
    );
}

/**
 * Dashboard journey state is database-only by design: one Workflow API request
 * per card would turn the library into an external-service waterfall. The
 * persisted Workflow observation is displayed, while an open project performs
 * a fresh Workflow-aware health check.
 */
export async function listAuthoringJourneySnapshots(
  userId: string,
  accessInput: JourneyAccess | Promise<JourneyAccess>,
  opts?: { archived?: boolean },
): Promise<AuthoringJourneySnapshot[]> {
  const db = getDb();
  const [projects, access, [user]] = await Promise.all([
    listProjectsWithStats(userId, opts),
    accessInput,
    db
      .select({ suspended: schema.users.suspended })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1),
  ]);
  if (projects.length === 0) return [];
  const balanceCredits = access.balanceCredits ?? (await getBalance(userId));

  const runs = await readJourneyRuns(projects.map((project) => project.id));
  const [stageEvents, blockingIncidents] = await Promise.all([
    readLatestStageEvents(runs.map((run) => run.id)),
    readBlockingIncidentCategories(runs.map((run) => run.id)),
  ]);
  const runsByProject = new Map(runs.map((run) => [run.projectId, run]));
  const stagesByRun = new Map(stageEvents.map((event) => [event.runId, event]));
  const incidentCategoriesByRun = new Map<string, string[]>();
  for (const incident of blockingIncidents) {
    const categories = incidentCategoriesByRun.get(incident.runId) ?? [];
    categories.push(incident.category);
    incidentCategoriesByRun.set(incident.runId, categories);
  }

  return projects.map((project) => {
    const run = runsByProject.get(project.id);
    const artifacts = artifactsFromProject(
      project,
      run ? countSavedAuthoringCheckpoints(run.config) : 0,
    );
    return deriveAuthoringJourney({
      project: projectSeed(project),
      artifacts,
      access: {
        fullBookUnlocked: access.fullBookUnlocked,
        suspended: user?.suspended ?? false,
        balanceCredits,
      },
      spend: {
        meteredUsd: project.spendUsd,
        creditsUsed: project.creditsUsed,
      },
      run: run
        ? persistedRunToJourney({
            run,
            stageEvent: stagesByRun.get(run.id),
            artifacts,
            projectSpendUsd: project.spendUsd,
            projectCompletedAt: project.completedAt,
            blockingIncidentCategories: incidentCategoriesByRun.get(run.id),
          })
        : null,
    });
  });
}

function singleProjectArtifacts(
  data: ProjectData,
  chapters: ChapterList,
  outlineReady: boolean,
  savedCheckpoints: number,
): AuthoringJourneyArtifacts {
  let savedChapters = 0;
  let editedChapters = 0;
  let finalChapters = 0;
  let wordCount = 0;
  for (const chapter of chapters) {
    if (chapter.wordCount > 0) savedChapters += 1;
    if (chapter.status === "edited" || chapter.status === "final") editedChapters += 1;
    if (chapter.status === "final") finalChapters += 1;
    wordCount += chapter.wordCount;
  }
  return {
    briefReady: Boolean(data.project.brief?.trim() && data.project.title.trim()),
    bookReady: data.book !== null,
    fullBookCompletionReady: data.fullBookCompletionReady,
    outlineReady,
    savedChapters,
    savedCheckpoints,
    editedChapters,
    finalChapters,
    totalChapters: Math.max(data.project.targetChapters, chapters.length),
    wordCount,
  };
}

export async function getAuthoringJourneySnapshot(input: {
  userId: string;
  projectId: string;
  access?: JourneyAccess;
  data?: ProjectData;
  chapters?: ChapterList;
}): Promise<AuthoringJourneySnapshot | null> {
  const db = getDb();
  const [data, access, [user], run, balanceCredits] = await Promise.all([
    input.data ?? getProjectWithBook(input.userId, input.projectId),
    input.access ?? getStudioAccess(input.userId),
    db
      .select({ suspended: schema.users.suspended })
      .from(schema.users)
      .where(eq(schema.users.id, input.userId))
      .limit(1),
    getLatestAuthoringJourneyRun(input.projectId),
    input.access?.balanceCredits !== undefined
      ? Promise.resolve(input.access.balanceCredits)
      : getBalance(input.userId),
  ]);
  if (!data) return null;

  const [chapters, outline, workflowHealth, blockingIncidents] = await Promise.all([
    input.chapters ?? (data.book ? getChapterList(data.book.id) : Promise.resolve([])),
    data.book ? getLatestOutline(data.book.id) : Promise.resolve(null),
    run ? getRunHealth(run) : Promise.resolve(null),
    run ? readBlockingIncidentCategories([run.id]) : Promise.resolve([]),
  ]);
  const artifacts = singleProjectArtifacts(
    data,
    chapters,
    outline !== null,
    workflowHealth?.savedCheckpointCount ?? (run ? countSavedAuthoringCheckpoints(run.config) : 0),
  );
  const projectSpendUsd = workflowHealth?.spend.meteredUsd ?? 0;
  const journeyRun = run
    ? persistedRunToJourney({
        run,
        artifacts,
        projectSpendUsd,
        projectCompletedAt: data.project.completedAt,
        blockingIncidentCategories: blockingIncidents.map((incident) => incident.category),
        workflow: workflowHealth
          ? {
              databaseStatus: workflowHealth.databaseStatus,
              workflowStatus: workflowHealth.workflowStatus,
              effectiveStatus: workflowHealth.effectiveStatus,
              acceptedAt: workflowHealth.acceptedAt,
              startedAt: workflowHealth.startedAt,
              completedAt: workflowHealth.completedAt,
              lastUpdateAt: workflowHealth.lastUpdateAt,
              stage: workflowHealth.stage,
              progressPct: workflowHealth.progressPct,
              stageDescription: workflowHealth.stageDescription,
              authoringBegan: workflowHealth.authoringBegan,
              noWorkStarted: workflowHealth.noWorkStarted,
              completionArtifactsReady: workflowHealth.completionArtifactsReady,
              acceptanceUncertain: workflowHealth.acceptanceUncertain,
              safeToRetry: workflowHealth.safeToRetry,
              heartbeatAt: workflowHealth.heartbeatAt,
              health:
                workflowHealth.health === "critical"
                  ? "needs_attention"
                  : workflowHealth.health === "warning" || workflowHealth.health === "degraded"
                    ? "degraded"
                    : "healthy",
              dispatchAttempts: workflowHealth.dispatchAttempts,
              cancellation: workflowHealth.cancellation,
              pause: workflowHealth.pause,
              supportReference: workflowHealth.supportReference,
              spend: {
                ...workflowHealth.spend,
                scope: "run",
              },
            }
          : undefined,
      })
    : null;

  return deriveAuthoringJourney({
    project: {
      id: data.project.id,
      title: data.project.title,
      genre: data.project.genre,
      status: data.project.status,
      experience: data.project.experience,
      updatedAt: data.project.updatedAt.toISOString(),
      targetChapters: data.project.targetChapters,
      targetWordsPerChapter: data.project.targetWordsPerChapter,
      qualityTier: data.project.settings.qualityTier ?? "standard",
      brief: data.project.brief,
      completedAt: toIso(data.project.completedAt),
    },
    artifacts,
    access: {
      fullBookUnlocked: access.fullBookUnlocked,
      suspended: user?.suspended ?? false,
      balanceCredits,
    },
    spend: {
      meteredUsd: projectSpendUsd,
      creditsUsed: creditsForUsd(projectSpendUsd),
    },
    run: journeyRun,
  });
}

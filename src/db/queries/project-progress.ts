import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/db";
import type { ProjectProgressSnapshot, ProductionStage } from "@/lib/project-progress";
import { runEventSchema, type GenerationConfig } from "@/lib/run-events";

type ChapterProgressSeed = {
  chapterNumber: number;
  status: "planned" | "drafting" | "drafted" | "edited" | "final";
};

type StageProgressEvent = {
  stage: ProductionStage;
  pct: number;
  detail?: string;
  resumeStage?: Exclude<ProductionStage, "awaiting_credits">;
};

function stageFromRunStatus(status: string): ProductionStage {
  switch (status) {
    case "completed":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "awaiting_input":
      return "awaiting_approval";
    default:
      return "queued";
  }
}

export function resolveRunProgress(
  status: string,
  stageEvent: StageProgressEvent | null,
  durableProgress: StageProgressEvent | null = null,
): Pick<ProjectProgressSnapshot, "stage" | "pct" | "detail"> {
  const statusStage = stageFromRunStatus(status);
  const isTerminal = status === "completed" || status === "failed" || status === "cancelled";
  const canonicalProgress = stageEvent ?? durableProgress;

  if (isTerminal) {
    return {
      stage: statusStage,
      pct: status === "completed" ? 100 : (canonicalProgress?.pct ?? 0),
      // A non-terminal stage event may be the last event persisted before the
      // run stopped. Its detail would misdescribe the terminal state.
      detail: canonicalProgress?.stage === statusStage ? canonicalProgress.detail : undefined,
    };
  }

  return {
    stage: canonicalProgress?.stage ?? statusStage,
    pct: canonicalProgress?.pct ?? 0,
    detail: canonicalProgress?.detail,
    ...(canonicalProgress?.stage === "awaiting_credits" && canonicalProgress.resumeStage
      ? { pausedStage: canonicalProgress.resumeStage }
      : {}),
  };
}

export async function getProjectProductionProgress(
  projectId: string,
  chapters: ChapterProgressSeed[],
  fallbackTotalChapters: number,
): Promise<ProjectProgressSnapshot> {
  const db = getDb();
  const runColumns = {
    id: schema.generationRuns.id,
    status: schema.generationRuns.status,
    config: schema.generationRuns.config,
    currentStage: schema.generationRuns.currentStage,
    progressPct: schema.generationRuns.progressPct,
    stageDescription: schema.generationRuns.stageDescription,
    pauseDetails: schema.generationRuns.pauseDetails,
    cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
  };
  const [activeRun] = await db
    .select(runColumns)
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.kind, "full_book"),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
      ),
    )
    .orderBy(desc(schema.generationRuns.createdAt))
    .limit(1);
  const [latestRun] = activeRun
    ? [activeRun]
    : await db
        .select(runColumns)
        .from(schema.generationRuns)
        .where(
          and(
            eq(schema.generationRuns.projectId, projectId),
            eq(schema.generationRuns.kind, "full_book"),
          ),
        )
        .orderBy(desc(schema.generationRuns.createdAt))
        .limit(1);
  const run = activeRun ?? latestRun;

  if (!run) {
    const draftedCount = chapters.filter(
      (chapter) => chapter.status !== "planned" && chapter.status !== "drafting",
    ).length;
    return {
      runId: null,
      stage: "queued",
      pct: 0,
      draftedCount,
      totalChapters: fallbackTotalChapters,
    };
  }

  const [latestStageEvent] = await db
    .select({ payload: schema.generationEvents.payload })
    .from(schema.generationEvents)
    .where(
      and(eq(schema.generationEvents.runId, run.id), eq(schema.generationEvents.type, "stage")),
    )
    .orderBy(desc(schema.generationEvents.seq))
    .limit(1);
  const parsed = runEventSchema.safeParse(latestStageEvent?.payload);
  const stageEvent = parsed.success && parsed.data.type === "stage" ? parsed.data : null;
  const config = run.config as Partial<GenerationConfig>;
  const totalChapters = config.targetChapters ?? fallbackTotalChapters;
  const draftedCount = chapters.filter(
    (chapter) =>
      chapter.chapterNumber <= totalChapters &&
      chapter.status !== "planned" &&
      chapter.status !== "drafting",
  ).length;
  const resumeStage = run.pauseDetails?.resumeStage;
  const durableProgress: StageProgressEvent = {
    stage: run.currentStage,
    pct: run.progressPct,
    ...(run.stageDescription ? { detail: run.stageDescription } : {}),
    ...(run.currentStage === "awaiting_credits" &&
    resumeStage &&
    [
      "queued",
      "concept",
      "awaiting_guidance",
      "outline",
      "awaiting_approval",
      "bible",
      "chapters",
      "editing",
      "continuity",
      "revising",
      "finalizing",
      "done",
      "failed",
      "cancelled",
    ].includes(resumeStage)
      ? { resumeStage: resumeStage as Exclude<ProductionStage, "awaiting_credits"> }
      : {}),
  };
  const resolvedProgress = resolveRunProgress(run.status, stageEvent, durableProgress);

  return {
    runId: run.id,
    ...resolvedProgress,
    ...(run.cancellationRequestedAt
      ? { cancellationRequestedAt: run.cancellationRequestedAt.toISOString() }
      : {}),
    draftedCount,
    totalChapters,
  };
}

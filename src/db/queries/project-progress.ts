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
): Pick<ProjectProgressSnapshot, "stage" | "pct" | "detail"> {
  const statusStage = stageFromRunStatus(status);
  const isTerminal = status === "completed" || status === "failed" || status === "cancelled";

  if (isTerminal) {
    return {
      stage: statusStage,
      pct: status === "completed" ? 100 : (stageEvent?.pct ?? 0),
      // A non-terminal stage event may be the last event persisted before the
      // run stopped. Its detail would misdescribe the terminal state.
      detail: stageEvent?.stage === statusStage ? stageEvent.detail : undefined,
    };
  }

  return {
    stage: stageEvent?.stage ?? statusStage,
    pct: stageEvent?.pct ?? 0,
    detail: stageEvent?.detail,
    ...(stageEvent?.stage === "awaiting_credits" && stageEvent.resumeStage
      ? { pausedStage: stageEvent.resumeStage }
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
  const resolvedProgress = resolveRunProgress(run.status, stageEvent);

  return {
    runId: run.id,
    ...resolvedProgress,
    draftedCount,
    totalChapters,
  };
}

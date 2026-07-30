import type { Stage } from "@/lib/run-events";

export type ProductionStage = Stage;

export type ProjectProgressSnapshot = {
  runId: string | null;
  stage: ProductionStage;
  pct: number;
  detail?: string;
  /** Concrete work phase suspended by an awaiting_credits gate. */
  pausedStage?: Exclude<ProductionStage, "awaiting_credits">;
  draftedCount: number;
  totalChapters: number;
};

export type LifecyclePhase = "Plan" | "Produce" | "Refine" | "Publish";

export const PRODUCTION_STAGE_LABELS: Record<ProductionStage, string> = {
  queued: "Preparing the writing room",
  concept: "Developing the concept",
  outline: "Building the outline",
  awaiting_approval: "Waiting for outline approval",
  bible: "Building the story bible",
  awaiting_credits: "Waiting for credits",
  chapters: "Drafting chapters",
  editing: "Editing the draft",
  continuity: "Checking continuity",
  revising: "Revising the manuscript",
  finalizing: "Assembling the manuscript",
  done: "Manuscript complete",
  failed: "Production needs attention",
  cancelled: "Production stopped",
};

const TERMINAL_PRODUCTION_STAGES: ReadonlySet<ProductionStage> = new Set([
  "done",
  "failed",
  "cancelled",
]);

const PAUSABLE_PRODUCTION_STAGES: ReadonlySet<string> = new Set([
  "queued",
  "concept",
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
] satisfies Exclude<ProductionStage, "awaiting_credits">[]);

export function isActiveProductionProgress(progress: ProjectProgressSnapshot): boolean {
  return progress.runId !== null && !TERMINAL_PRODUCTION_STAGES.has(progress.stage);
}

export function isProjectProgressSnapshot(value: unknown): value is ProjectProgressSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProjectProgressSnapshot>;
  return (
    (candidate.runId === null || typeof candidate.runId === "string") &&
    typeof candidate.stage === "string" &&
    candidate.stage in PRODUCTION_STAGE_LABELS &&
    typeof candidate.pct === "number" &&
    Number.isFinite(candidate.pct) &&
    typeof candidate.draftedCount === "number" &&
    Number.isInteger(candidate.draftedCount) &&
    candidate.draftedCount >= 0 &&
    typeof candidate.totalChapters === "number" &&
    Number.isInteger(candidate.totalChapters) &&
    candidate.totalChapters >= 0 &&
    (candidate.detail === undefined || typeof candidate.detail === "string") &&
    (candidate.pausedStage === undefined ||
      (typeof candidate.pausedStage === "string" &&
        PAUSABLE_PRODUCTION_STAGES.has(candidate.pausedStage)))
  );
}

export function lifecyclePhaseForProduction(
  stage: ProductionStage,
  pausedStage?: Exclude<ProductionStage, "awaiting_credits">,
): LifecyclePhase {
  const effectiveStage = stage === "awaiting_credits" && pausedStage ? pausedStage : stage;
  switch (effectiveStage) {
    case "queued":
    case "concept":
    case "outline":
    case "awaiting_approval":
      return "Plan";
    case "bible":
    case "chapters":
    case "awaiting_credits":
    case "failed":
    case "cancelled":
      return "Produce";
    case "editing":
    case "continuity":
    case "revising":
      return "Refine";
    case "finalizing":
    case "done":
      return "Publish";
  }
}

export function describeProductionProgress(progress: ProjectProgressSnapshot): string {
  const detail = progress.detail?.trim();
  if (progress.stage === "awaiting_credits" && progress.pausedStage) {
    const pauseDescription = `${PRODUCTION_STAGE_LABELS.awaiting_credits} before ${PRODUCTION_STAGE_LABELS[
      progress.pausedStage
    ].toLowerCase()}`;
    return detail ? `${pauseDescription} · ${detail}` : pauseDescription;
  }
  const label = PRODUCTION_STAGE_LABELS[progress.stage];
  if (progress.stage === "chapters" && progress.totalChapters > 0 && progress.draftedCount >= 0) {
    return `${label} · ${progress.draftedCount} of ${progress.totalChapters} assembled`;
  }
  return detail ? `${label} · ${detail}` : label;
}

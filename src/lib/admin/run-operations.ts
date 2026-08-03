import type { GenerationConfig } from "@/lib/run-events";
import type { RunHealth } from "@/lib/run-health";

export type AdminRunCheckpointSummary = {
  protocolVersion: 1 | 2;
  dispatchReady: boolean;
  stagedConcept: boolean;
  stagedOutline: boolean;
  preparationSteps: number;
  manuscriptPrepared: boolean;
  chapterPlans: number;
  chapterDrafts: number;
  chapterResults: number;
  editedChapterResults: number;
  entityBible: boolean;
  chapterSummaries: number;
  editedChapters: number;
  revisionChapters: number;
  continuityPhases: number;
  continuityReport: boolean;
  finalized: boolean;
  finalizationOwnedByRun: boolean;
  completionDigestRecorded: boolean;
};

export function summarizeAdminRunCheckpoints(
  runId: string,
  rawConfig: unknown,
): AdminRunCheckpointSummary {
  const config = (rawConfig ?? {}) as Partial<GenerationConfig>;
  const chapterWork = Object.values(config.work?.chapters ?? {});
  const completion = config.completion;
  const finalization = completion?.finalized;

  return {
    protocolVersion: config.protocolVersion === 2 ? 2 : 1,
    dispatchReady: config.dispatchReady === true,
    stagedConcept: config.stagedConcept !== undefined,
    stagedOutline: config.stagedOutline !== undefined,
    preparationSteps: Object.values(config.preparation ?? {}).filter(Boolean).length,
    manuscriptPrepared: config.manuscriptPrepared === true,
    chapterPlans: chapterWork.filter((chapter) => chapter.scenePlan !== undefined).length,
    chapterDrafts: chapterWork.filter((chapter) => chapter.draft !== undefined).length,
    chapterResults: chapterWork.filter((chapter) => chapter.result !== undefined).length,
    editedChapterResults: Object.keys(config.work?.edits ?? {}).length,
    entityBible: completion?.entityBible !== undefined,
    chapterSummaries: Object.keys(completion?.chapterSummaries ?? {}).length,
    editedChapters: Object.keys(completion?.editedChapters ?? {}).length,
    revisionChapters: Object.keys(completion?.revisionChapters ?? {}).length,
    continuityPhases: Object.keys(completion?.continuityOutcomes ?? {}).length,
    continuityReport: completion?.continuityReport !== undefined,
    finalized: finalization !== undefined,
    finalizationOwnedByRun: finalization?.sourceRunId === runId,
    completionDigestRecorded: Boolean(finalization?.manuscriptDigest),
  };
}

export type AdminRunRecommendedActionKind =
  | "none"
  | "monitor"
  | "wait_for_author"
  | "redispatch"
  | "redeliver_input"
  | "recheck"
  | "investigate_completion"
  | "confirm_cancellation"
  | "support_recovery";

export type AdminRunRecommendedAction = {
  kind: AdminRunRecommendedActionKind;
  label: string;
  description: string;
};

export function recommendAdminRunAction(input: {
  health: RunHealth;
  acceptedInputCount: number;
  hasOpenCriticalIncident: boolean;
}): AdminRunRecommendedAction {
  const { health } = input;
  const active = ["queued", "running", "awaiting_input"].includes(health.effectiveStatus);

  if (health.cancellation && active) {
    return {
      kind: "confirm_cancellation",
      label: "Recheck cancellation",
      description:
        "Cancellation is only a request until Workflow reports a terminal state. Recheck; do not mark the run cancelled manually.",
    };
  }

  if (
    (health.databaseStatus === "completed" || health.workflowStatus === "completed") &&
    !health.completionArtifactsReady
  ) {
    return {
      kind: "investigate_completion",
      label: "Investigate completion proof",
      description:
        "A terminal completion claim is missing its required manuscript artifacts. Preserve the run and inspect its checkpoints before repair.",
    };
  }

  if (health.pause && input.acceptedInputCount > 0) {
    return {
      kind: "redeliver_input",
      label: "Redeliver accepted input",
      description:
        "The author response is durably accepted but not consumed. Redelivery is idempotent for the registered pause version.",
    };
  }

  if (health.pause) {
    return {
      kind: "wait_for_author",
      label: "Wait for author",
      description:
        health.pause.kind === "outline_approval"
          ? "The run is durably paused for outline approval; no operator mutation is required."
          : "The run is durably paused for credits; keep the saved work and wait for the author.",
    };
  }

  if (
    health.databaseStatus === "queued" &&
    health.acceptanceUncertain &&
    !health.authoringBegan &&
    health.dispatchAttempts < 3
  ) {
    return {
      kind: "redispatch",
      label: "Redispatch same run",
      description:
        "The dispatch lease is uncertain and no paid work is recorded. Reuse this durable run; never create a replacement automatically.",
    };
  }

  if (
    active &&
    (input.hasOpenCriticalIncident ||
      health.health === "critical" ||
      health.health === "degraded" ||
      health.workflowStatus === "unavailable")
  ) {
    return {
      kind: "recheck",
      label: "Recheck evidence",
      description:
        "Refresh Workflow and database evidence before taking action. A missing probe or silent heartbeat alone is not terminal proof.",
    };
  }

  if (active) {
    return {
      kind: "monitor",
      label: "Monitor",
      description:
        "The effective run state is active and internally consistent. Continue monitoring its heartbeat and durable events.",
    };
  }

  if (health.effectiveStatus === "completed" && health.completionArtifactsReady) {
    return {
      kind: "none",
      label: "No action required",
      description: "Workflow, database state, and required completion artifacts agree.",
    };
  }

  if (health.savedChapterCount > 0) {
    return {
      kind: "support_recovery",
      label: "Offer saved-work recovery",
      description:
        "Partial manuscript work is durable. The author must explicitly resume from saved work; do not restart automatically.",
    };
  }

  if (health.safeToRetry) {
    return {
      kind: "support_recovery",
      label: "Author may retry safely",
      description:
        "No paid authoring work or open hold remains. Direct the author to the product recovery action; do not start it for them.",
    };
  }

  return {
    kind: "recheck",
    label: "Inspect contradictory state",
    description:
      "The evidence does not support an automatic repair. Recheck Workflow, incidents, checkpoints, and holds before intervening.",
  };
}

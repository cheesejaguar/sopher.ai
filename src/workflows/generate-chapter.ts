import { FatalError, getWorkflowMetadata } from "workflow";
import {
  AUTHORING_CANCELLATION_MESSAGE,
  AUTHORING_RUN_INACTIVE_MESSAGE,
} from "@/lib/authoring-cancellation";
import { withPreservedPrimaryError } from "@/lib/async-cleanup";
import { notifyAuthoringFailureStep } from "./notify-authoring-failure";
import type { GenerationConfig } from "@/lib/run-events";
import {
  emitCost,
  emitProgress,
  linkWorkflowRunStep,
  markRunStatus,
  releaseCreditsStep,
  resetChapterStep,
  writeChapterStep,
} from "./steps";

/**
 * Regenerates a single chapter in place. The old prose is snapshotted to the
 * revision history first, then the chapter runs back through the full
 * plan → draft → critique → revise pipeline with current canon (story bible,
 * neighbouring summaries) as context.
 */
export async function generateChapter(
  dbRunId: string,
  projectId: string,
  userId: string,
  chapterNumber: number,
  config: GenerationConfig,
  reservationRef: string,
) {
  "use workflow";
  const ref = { dbRunId, projectId, userId };
  const { workflowRunId } = getWorkflowMetadata();

  // The first Workflow to link owns both the DB run and its shared credit
  // reservation. A duplicate response-loss retry must exit before `finally`
  // can release the winner's reservation.
  if (!(await linkWorkflowRunStep(ref, workflowRunId))) return;

  try {
    await markRunStatus(ref, "running");
    await emitProgress(ref, { type: "stage", stage: "chapters", pct: 5 });
    await emitProgress(ref, {
      type: "agent",
      agent: "writer",
      message: `Rewriting chapter ${chapterNumber}`,
    });

    const result = await withPreservedPrimaryError(
      async () => {
        await resetChapterStep(ref, chapterNumber);
        const chapter = await writeChapterStep(ref, config, chapterNumber, reservationRef);
        await emitCost(ref);
        return chapter;
      },
      () => releaseCreditsStep(ref, reservationRef),
      (cleanupError) => {
        console.error("Chapter reservation cleanup failed after writing had already failed", {
          runId: ref.dbRunId,
          cleanupError,
        });
      },
    );

    const completion = await markRunStatus(ref, "completed");
    if (completion.outcome === "cancellation_won") {
      await emitProgress(ref, {
        type: "stage",
        stage: "cancelled",
        pct: 100,
        detail: "Stopped safely after saving the completed chapter",
      });
      return result;
    }
    await emitProgress(ref, {
      type: "stage",
      stage: "done",
      pct: 100,
      detail: `Chapter ${chapterNumber} rewritten — ${result.wordCount.toLocaleString()} words`,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chapter regeneration failed";
    if (message === AUTHORING_RUN_INACTIVE_MESSAGE) {
      throw error instanceof FatalError ? error : new FatalError(message);
    }
    const cancelled = message === AUTHORING_CANCELLATION_MESSAGE;
    try {
      await markRunStatus(ref, cancelled ? "cancelled" : "failed", message);
      if (!cancelled) await notifyAuthoringFailureStep(ref);
    } catch (statusError) {
      console.error("Could not persist the initiating chapter failure", {
        runId: ref.dbRunId,
        statusError,
      });
    }
    try {
      await emitProgress(
        ref,
        cancelled
          ? { type: "stage", stage: "cancelled", pct: 100, detail: "Stopped safely" }
          : { type: "error", message, fatal: true },
      );
    } catch (eventError) {
      console.warn("Could not publish the initiating chapter failure", {
        runId: ref.dbRunId,
        eventError,
      });
    }
    throw error instanceof FatalError ? error : new FatalError(message);
  }
}

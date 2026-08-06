import { FatalError, getWorkflowMetadata } from "workflow";

import type { ContinuityOutcome } from "@/ai/agents/continuity";
import { continuityPhaseKeys } from "@/ai/prompts/review-rubric";
import {
  AUTHORING_CANCELLATION_MESSAGE,
  AUTHORING_RUN_INACTIVE_MESSAGE,
} from "@/lib/authoring-cancellation";
import { authoringFailureMessage, classifyAuthoringFailure } from "@/lib/authoring-failures";
import type { GenerationConfig } from "@/lib/run-events";
import {
  continuityCreditCheckStep,
  continuityFinalizeStep,
  continuityPhaseStep,
  emitCost,
  emitProgress,
  linkWorkflowRunStep,
  markRunStatus,
  releaseCreditsStep,
  reserveCreditsStep,
} from "./steps";

/**
 * Author-triggered re-run of the cross-chapter consistency review.
 *
 * This exists because the book workflow may now skip the review to save a run
 * (DEGRADATION_CODES.continuity_review_unavailable / _partial). The author is
 * told the review did not happen; without this there was no way to ask for it
 * afterwards.
 *
 * It is a durable Workflow rather than an inline request for three reasons:
 *
 *   1. Six rubric phases, each a multi-step tool-using provider call over the
 *      whole manuscript, run past any request budget. The book workflow already
 *      checkpoints each phase separately for exactly this reason.
 *   2. `metered` refuses to dispatch against a terminal run, so a re-review must
 *      be its own *active* generation run. A request that dies mid-flight would
 *      strand that run and its credit holds; a Workflow's step checkpoints plus
 *      the existing reservation sweep are what make that recoverable.
 *   3. Every phase is separately authorized and reserved. A retry replays the
 *      phases that already finished instead of re-billing the author for them.
 *
 * Unlike the book run, a failure here is not absorbed. There is no manuscript at
 * risk — the book was delivered before this started — so the honest outcome of a
 * review that cannot finish is a failed review, not a book with a partial score
 * presented as a verdict.
 */
export async function reviewManuscriptContinuity(
  dbRunId: string,
  projectId: string,
  userId: string,
  config: GenerationConfig,
) {
  "use workflow";
  const ref = { dbRunId, projectId, userId };
  const { workflowRunId } = getWorkflowMetadata();

  // A response-loss retry may dispatch the same durable run twice. Exactly one
  // Workflow owns it; the linkage loser exits before its failure handler can
  // terminalize the winner's row.
  if (!(await linkWorkflowRunStep(ref, workflowRunId))) return;

  try {
    await markRunStatus(ref, "running");
    await emitProgress(ref, { type: "stage", stage: "continuity", pct: 5 });
    await emitProgress(ref, {
      type: "agent",
      agent: "continuity",
      message: "Reading the manuscript for consistency",
    });

    const plannedPhases = continuityPhaseKeys(config.tier);
    const outcomes: ContinuityOutcome[] = [];
    for (const [index, phaseKey] of plannedPhases.entries()) {
      const quote = await continuityCreditCheckStep(ref, config, phaseKey);
      // The read-only quote above is for the pause copy; this serialized hold is
      // the authorization boundary. There is deliberately no top-up pause here:
      // the author was quoted the whole review before it started, and a review
      // that stalls halfway holding a lock on their project is worse than one
      // that stops and can be asked for again.
      const authorization = await reserveCreditsStep(
        ref,
        quote.required,
        `continuity-review:${phaseKey}`,
      );
      if (!authorization.sufficient) {
        throw new FatalError(
          `${authorization.balance.toFixed(0)} of ${authorization.required.toFixed(0)} credits needed to finish the consistency review`,
        );
      }
      try {
        outcomes.push(
          await continuityPhaseStep(ref, config, phaseKey, authorization.reservationRef),
        );
      } finally {
        await releaseCreditsStep(ref, authorization.reservationRef);
      }
      await emitProgress(ref, {
        type: "stage",
        stage: "continuity",
        pct: 5 + Math.round(85 * ((index + 1) / plannedPhases.length)),
        detail: `${index + 1} of ${plannedPhases.length} review passes complete`,
      });
    }

    // Every planned phase produced an outcome or we never got here, so the score
    // is renormalized over the full rubric and `review` is published.
    const report = await continuityFinalizeStep(ref, outcomes, true);
    await emitCost(ref);
    await emitProgress(ref, {
      type: "stage",
      stage: "done",
      pct: 100,
      detail: report.recommendation,
    });
    await markRunStatus(ref, "completed");
    return {
      score: report.score,
      recommendation: report.recommendation,
      issueCount: report.issues.length,
    };
  } catch (error) {
    const message = authoringFailureMessage(error);
    const failure = classifyAuthoringFailure(error);
    if (message === AUTHORING_RUN_INACTIVE_MESSAGE) {
      throw error instanceof FatalError ? error : new FatalError(message);
    }
    const cancelled = message === AUTHORING_CANCELLATION_MESSAGE;
    try {
      await markRunStatus(
        ref,
        cancelled ? "cancelled" : "failed",
        message,
        cancelled ? undefined : failure,
      );
    } catch (statusError) {
      console.error("Could not persist the initiating continuity-review failure", {
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
      console.warn("Could not publish the initiating continuity-review failure", {
        runId: ref.dbRunId,
        eventError,
      });
    }
    throw error instanceof FatalError ? error : new FatalError(message);
  }
}

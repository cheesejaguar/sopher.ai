import { FatalError, getWorkflowMetadata } from "workflow";

import type { ContinuityOutcome, ContinuityReport } from "@/ai/agents/continuity";
import { continuityPhaseKeys } from "@/ai/prompts/review-rubric";
import {
  AUTHORING_CANCELLATION_MESSAGE,
  AUTHORING_RUN_INACTIVE_MESSAGE,
} from "@/lib/authoring-cancellation";
import { authoringFailureMessage, classifyAuthoringFailure } from "@/lib/authoring-failures";
import type { GenerationConfig } from "@/lib/run-events";
import {
  continuityChapterRepairsStep,
  continuityFinalizeStep,
  continuityPhaseStep,
  editChapterStep,
  emitCost,
  emitProgress,
  linkWorkflowRunStep,
  markRunStatus,
  releaseCreditsStep,
  reserveCreditsStep,
  standaloneContinuityCreditCheckStep,
} from "./steps";
import { continuityRepairProgress } from "./continuity-repairs";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

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
 *   3. One parent reservation holds the complete quoted ceiling, while phase
 *      checkpoints keep retries from re-billing work that already finished.
 *
 * A review-phase failure is not absorbed: a partial score is never presented
 * as a verdict. After the complete report is durable, however, a failed or
 * no-op repair stays an open finding instead of invalidating the paid review.
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
    // The start action quotes this same ceiling. Claim it once, before the
    // first provider call, and use the parent hold for every review and repair
    // settlement. Concurrent spend can no longer strand a paid partial review.
    const quote = await standaloneContinuityCreditCheckStep(ref, config);
    const authorization = await reserveCreditsStep(
      ref,
      quote.required,
      "continuity-review:full-ceiling",
    );
    if (!authorization.sufficient) {
      throw new FatalError(
        `${authorization.balance.toFixed(0)} of ${authorization.required.toFixed(0)} credits needed to finish the consistency review`,
      );
    }

    let report: ContinuityReport;
    let revisionTotal = 0;
    let revisionProcessed = 0;
    let revisionApplied = 0;
    let repairPlanningFailed = false;
    try {
      const outcomes: ContinuityOutcome[] = [];
      for (const [index, phaseKey] of plannedPhases.entries()) {
        outcomes.push(
          await continuityPhaseStep(ref, config, phaseKey, authorization.reservationRef),
        );
        await emitProgress(ref, {
          type: "stage",
          stage: "continuity",
          pct: 5 + Math.round(85 * ((index + 1) / plannedPhases.length)),
          detail: `${index + 1} of ${plannedPhases.length} review passes complete`,
        });
      }

      // Every planned phase produced an outcome or we never got here, so the score
      // is renormalized over the full rubric and `review` is published. Once this
      // durable report exists, an individual repair failure must not force the
      // author to buy and run the entire review again.
      report = await continuityFinalizeStep(ref, outcomes, true);
      await emitCost(ref);

      let chapterRepairs: Awaited<ReturnType<typeof continuityChapterRepairsStep>> = [];
      try {
        chapterRepairs = await continuityChapterRepairsStep(ref, config, outcomes);
      } catch (error) {
        const message = authoringFailureMessage(error);
        if (
          message === AUTHORING_CANCELLATION_MESSAGE ||
          message === AUTHORING_RUN_INACTIVE_MESSAGE
        ) {
          throw error;
        }
        repairPlanningFailed = true;
        console.warn("Continuity findings remain open because repair planning failed", {
          runId: ref.dbRunId,
        });
      }
      revisionTotal = chapterRepairs.length;
      if (revisionTotal > 0) {
        await emitProgress(ref, {
          type: "stage",
          stage: "revising",
          pct: 92,
          detail: `${revisionTotal} affected ${revisionTotal === 1 ? "chapter" : "chapters"} to process for targeted corrections`,
        });
        for (const wave of chunk(chapterRepairs, config.waveSize)) {
          const results = await Promise.allSettled(
            wave.map((repair) =>
              editChapterStep(
                ref,
                config,
                repair.chapterNumber,
                repair.issueNotes,
                authorization.reservationRef,
              ),
            ),
          );
          for (const [index, result] of results.entries()) {
            if (result.status === "fulfilled" && result.value.changed) {
              revisionApplied += 1;
              continue;
            }
            if (result.status === "rejected") {
              const message = authoringFailureMessage(result.reason);
              if (
                message === AUTHORING_CANCELLATION_MESSAGE ||
                message === AUTHORING_RUN_INACTIVE_MESSAGE
              ) {
                throw result.reason;
              }
              console.warn("A continuity repair remains unresolved after step retries", {
                runId: ref.dbRunId,
                chapterNumber: wave[index]?.chapterNumber,
              });
            }
          }
          revisionProcessed += wave.length;
          const progress = continuityRepairProgress(revisionProcessed, revisionApplied);
          await emitProgress(ref, {
            type: "stage",
            stage: "revising",
            pct: 92 + Math.round(6 * (revisionProcessed / revisionTotal)),
            detail: progress.detail,
          });
          await emitCost(ref);
        }
      }
      if (repairPlanningFailed) revisionProcessed = 0;
    } finally {
      try {
        await releaseCreditsStep(ref, authorization.reservationRef);
      } catch (cleanupError) {
        // The terminal reservation sweep is the final backstop. A cleanup
        // outage must not invalidate a durable paid report or hide the
        // initiating review failure behind a secondary error.
        console.error("Standalone continuity reservation release failed", {
          runId: ref.dbRunId,
          cleanupError,
        });
      }
    }

    const repairs = continuityRepairProgress(revisionProcessed, revisionApplied);
    await emitProgress(ref, {
      type: "stage",
      stage: "done",
      pct: 100,
      detail:
        revisionTotal > 0
          ? `${report.recommendation} ${repairs.detail}. Findings remain open until you verify them.`
          : repairPlanningFailed
            ? `${report.recommendation} Automatic correction planning could not complete; findings remain open for your review.`
            : `${report.recommendation} No findings qualified for an automatic prose change; findings remain open for your review.`,
    });
    await markRunStatus(ref, "completed");
    return {
      score: report.score,
      recommendation: report.recommendation,
      issueCount: report.issues.length,
      appliedChapterCount: repairs.appliedChapterCount,
      unresolvedChapterCount: repairs.unresolvedChapterCount,
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

import {
  AUTHORING_CANCELLATION_MESSAGE,
  AUTHORING_RUN_INACTIVE_MESSAGE,
} from "@/lib/authoring-cancellation";
import { authoringFailureMessage, classifyAuthoringFailure } from "@/lib/authoring-failures";
import type { Stage } from "@/lib/run-events";

/**
 * Which authoring passes may be skipped to save a run.
 *
 * The dividing line is whether the pass produces the manuscript or merely
 * improves it. Concept, outline, the entity bible, and chapter drafting are
 * load-bearing: without them there is no book. Everything here runs against a
 * manuscript that already exists on disk, so skipping it costs polish, never
 * prose.
 *
 * This distinction is the whole lesson of the 2026-08-04 incident: a review
 * pass that could not parse its own output discarded twelve finished, edited,
 * fully paid-for chapters.
 */
export const DEGRADATION_CODES = {
  /** The optional "what should this story do" question could not be prepared. */
  creative_question_unavailable: "creative_question_unavailable",
  /** One or more chapters could not be run through the editorial pass. */
  editorial_pass_incomplete: "editorial_pass_incomplete",
  /** The cross-chapter consistency review could not produce a report at all. */
  continuity_review_unavailable: "continuity_review_unavailable",
  /** Some review phases ran; the findings are real but the score is not. */
  continuity_review_partial: "continuity_review_partial",
  /** Continuity found issues but the targeted rewrite could not be applied. */
  continuity_revision_skipped: "continuity_revision_skipped",
} as const;

export type DegradationCode = (typeof DEGRADATION_CODES)[keyof typeof DEGRADATION_CODES];

export type DegradedPass = {
  stage: Stage;
  code: DegradationCode;
  /** Operator-safe. Never provider output or manuscript text. */
  reason: string;
};

/**
 * Author-facing copy. Written for someone with no authoring or technical
 * background: say what did not happen, then say the book is still theirs.
 * Never name an agent, a model, a step, or an error code.
 */
const AUTHOR_NOTICE: Record<DegradationCode, string> = {
  creative_question_unavailable:
    "We couldn't prepare the story direction question, so we carried on with the brief you wrote.",
  editorial_pass_incomplete:
    "We couldn't finish the editing pass on every chapter. Your full manuscript is saved, and you can run editing again on any chapter from the editor.",
  continuity_review_unavailable:
    "We couldn't complete the consistency review, so your book was finished without it. Every chapter is written and saved — only the review report is missing.",
  continuity_review_partial:
    "Only part of the consistency review finished. The notes it did produce are in the editor, but there is no overall score for this draft.",
  continuity_revision_skipped:
    "We found some consistency notes but couldn't apply the suggested rewrites. Your chapters are saved exactly as they were written, and the notes are in the editor.",
};

export function degradationNotice(code: DegradationCode): string {
  return AUTHOR_NOTICE[code];
}

/**
 * Whether a failure may be absorbed so the book can still be delivered.
 *
 * Two families must always keep propagating, for different reasons:
 *
 * Cancellation and "another writer owns this run" are control flow, not
 * failures. Absorbing either would tell an author who pressed stop that their
 * book finished, or let a superseded run terminalize the live one.
 *
 * Unresolved metering is subtler and cost a review pass to spot. When a
 * provider call is rejected after dispatch, `metered` deliberately leaves the
 * intent and its credit hold open for operator reconciliation, and the next
 * attempt refuses to repeat the call. Absorbing that would mark the run
 * `completed` — and completion is exactly the state the reconciliation
 * machinery cannot see: the unresolved-metering sweep only considers failed and
 * cancelled runs, the incident row is only written on the failed transition,
 * and the admin reconcile action is only offered for a failed run. The hold
 * would stay against the author's balance with the run reading as a success,
 * and the start-safety gate would let the next run reuse a billing key whose
 * charge is still ambiguous. A billing question mark has to stay loud.
 */
export function isDegradableFailure(error: unknown): boolean {
  const message = authoringFailureMessage(error);
  if (message === AUTHORING_CANCELLATION_MESSAGE || message === AUTHORING_RUN_INACTIVE_MESSAGE) {
    return false;
  }
  return classifyAuthoringFailure(error).incidentCategory === undefined;
}

/**
 * Summary line for the completion email and the run viewer. Returns undefined
 * for a clean run so callers can branch on presence rather than on empty text.
 */
export function degradationSummary(passes: readonly DegradedPass[]): string | undefined {
  if (passes.length === 0) return undefined;
  if (passes.length === 1) return degradationNotice(passes[0].code);
  return `${passes.length} finishing steps were skipped so your manuscript could still be delivered. ${passes
    .map((pass) => degradationNotice(pass.code))
    .join(" ")}`;
}

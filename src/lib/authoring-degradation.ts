import {
  AUTHORING_CANCELLATION_MESSAGE,
  AUTHORING_RUN_INACTIVE_MESSAGE,
} from "@/lib/authoring-cancellation";
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
  /** The cross-chapter consistency review could not produce a report. */
  continuity_review_unavailable: "continuity_review_unavailable",
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
  continuity_revision_skipped:
    "We found some consistency notes but couldn't apply the suggested rewrites. Your chapters are saved exactly as they were written, and the notes are in the editor.",
};

export function degradationNotice(code: DegradationCode): string {
  return AUTHOR_NOTICE[code];
}

/**
 * A run that the author stopped, or that another writer already terminalized,
 * must never be quietly "degraded" into a completed book. Those two messages
 * are control flow, not failures, and have to keep propagating.
 */
export function isDegradableFailure(message: string): boolean {
  return message !== AUTHORING_CANCELLATION_MESSAGE && message !== AUTHORING_RUN_INACTIVE_MESSAGE;
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

export type AuthoringFailureDetails = {
  errorCode?: string;
  errorStage?: string;
  incidentCategory?: "unresolved_metering" | "completion_contradiction";
};

const UNRESOLVED_METERING_MESSAGES = [
  "unresolved local metering",
  "reconciliation is required",
] as const;

const SETTLED_OUTPUT_MISSING_MESSAGE = "already settled but its output checkpoint is missing";

const UNRESOLVED_METERING_FAILURE_MESSAGE =
  "A prior provider attempt has unresolved local metering. The call was not repeated; reconciliation is required.";
const SETTLED_OUTPUT_MISSING_FAILURE_MESSAGE =
  "This logical provider call was already settled but its output checkpoint is missing. The call was not repeated.";

/**
 * Mirrors the two lifecycle messages in `@/lib/authoring-cancellation`. That
 * module opens a database connection and this one is imported by the run
 * viewer, so the strings are duplicated rather than the module.
 */
const CANCELLATION_FAILURE_MESSAGE = "Authoring cancellation requested";
const RUN_INACTIVE_FAILURE_MESSAGE = "Generation run is no longer active";

/** Longer than any operator phrasing below; a provider body never fits. */
const MAX_FAILURE_MESSAGE_LENGTH = 240;

function ownString(value: object, key: string): string | null {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor && typeof descriptor.value === "string"
    ? descriptor.value
    : null;
}

function ownCause(value: object): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, "cause");
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function failureStrings(value: unknown, depth = 0): string[] {
  if (!value || typeof value !== "object" || depth > 2) return [];
  const name = value instanceof Error ? value.name : ownString(value, "name");
  const message = value instanceof Error ? value.message : ownString(value, "message");
  return [
    ...(name ? [name] : []),
    ...(message ? [message] : []),
    ...failureStrings(ownCause(value), depth + 1),
  ];
}

function extractedFailureMessage(value: unknown, depth = 0): string | null {
  if (!value || typeof value !== "object" || depth > 2) return null;
  const message = value instanceof Error ? value.message : ownString(value, "message");
  return message?.trim() || extractedFailureMessage(ownCause(value), depth + 1);
}

/**
 * Control characters would corrupt a log line, an email, or a run row.
 * Text over the cap is rejected rather than truncated: a clipped message is no
 * longer the operator phrasing it claims to be, and every caller has a fixed
 * phrasing to fall back to.
 */
function sanitizedFailureMessage(value: unknown): string | null {
  const raw = extractedFailureMessage(value);
  if (!raw) return null;
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > MAX_FAILURE_MESSAGE_LENGTH) return null;
  return cleaned;
}

type FailureSignature = {
  /** Lowercased substrings; any hit identifies this failure family. */
  fragments?: readonly string[];
  /** For provider text that only carries a status code. */
  patterns?: readonly RegExp[];
  errorCode: string | ((serialized: string) => string);
  incidentCategory?: AuthoringFailureDetails["incidentCategory"];
  /** Operator wording persisted whenever the observed text is not our own. */
  message: string;
  /**
   * The exact shape this codebase generates for the family. Only a message
   * matching it end to end is kept verbatim, so provider text — which may
   * quote a prompt or the manuscript — can never reach a persisted row.
   */
  verbatim?: RegExp;
  /** The leading `role.operation` token names the stage that failed. */
  stageFromOperation?: true;
};

const OUTPUT_DELIVERY_FINISH_REASON = /finish reason: ([a-z-]+)/;

/**
 * A bare `\b5\d\d\b` matches "Chapter 512 draft could not be saved" and a bare
 * `\b429\b` matches a token count, and either one would relabel a real bug as a
 * transient provider outage — which then tells the author to wait a few minutes
 * and try again for something that will never clear.
 *
 * So the number has to read like a status code: introduced by a word that
 * precedes one, and not followed by a unit that proves it is a quantity.
 */
const STATUS_INTRODUCERS =
  "http|https|status|statuscode|status code|code|provider|gateway|api|upstream|server|responded|returned|response";
const QUANTITY_UNITS = "tokens|bytes|words|characters|chapters|ms|s|seconds|minutes";

function STATUS_CODE(code: RegExp): RegExp {
  return new RegExp(
    String.raw`\b(?:${STATUS_INTRODUCERS})\W{0,4}${code.source}\b(?!\s*(?:${QUANTITY_UNITS})\b)`,
  );
}

/**
 * Anthropic's structured-output path strips numeric and length bounds from the
 * schema it is given, so a model that answers normally can still fail zod on
 * the way back. That is deterministic: the same request returns the same
 * unusable answer, and only a truncated answer is worth another attempt.
 */
function outputDeliveryCode(serialized: string): string {
  switch (OUTPUT_DELIVERY_FINISH_REASON.exec(serialized)?.[1]) {
    case "length":
      return "provider_output_truncated";
    case "content-filter":
      return "provider_content_filtered";
    default:
      return "provider_output_invalid";
  }
}

const FAILURE_SIGNATURES: readonly FailureSignature[] = [
  {
    fragments: [CANCELLATION_FAILURE_MESSAGE.toLowerCase(), "authoringcancellationrequestederror"],
    errorCode: "authoring_cancelled",
    message: CANCELLATION_FAILURE_MESSAGE,
  },
  {
    fragments: [RUN_INACTIVE_FAILURE_MESSAGE.toLowerCase(), "authoringruninactiveerror"],
    errorCode: "authoring_run_inactive",
    message: RUN_INACTIVE_FAILURE_MESSAGE,
  },
  {
    // The fatal preconditions `@/workflows/steps` throws by hand. Matching the
    // whole string keeps them readable for an operator without opening a door
    // for provider text that merely contains one of these phrases.
    // Every fatal precondition this codebase throws by hand. Listing them
    // exhaustively is what keeps an unrecognized failure from collapsing to
    // "Generation failed" — the exact blindness that made the 2026-08-04
    // incident undiagnosable from the run row. Matching whole strings, and
    // only strings we generate, keeps that door shut to provider text.
    fragments: [
      "project not found",
      "generation run not found",
      "book not found",
      "was not prepared",
      "generation state changed",
      "was preparing it",
      "no outline to write from",
      "did not match the active",
      "cancelled while waiting for credits",
      "has no prose to review",
      "cannot finalize",
    ],
    errorCode: "authoring_precondition",
    message: "An authoring precondition was not met. The step was not repeated.",
    verbatim:
      /^(Project not found|Generation run not found|Book not found|No outline to write from|Chapter \d+ was not prepared|Generation state changed too many times while checkpointing|Generation state changed while committing output|A chapter changed while the new run was preparing it|Chapter changed while regeneration was preparing it|Creative direction did not match the active question|Credit input did not match the active pause|Outline input did not match the active pause|Run cancelled while waiting for credits|This manuscript has no prose to review|Cannot finalize: expected \d+ complete chapters, found \d+)$/,
  },
  {
    fragments: [SETTLED_OUTPUT_MISSING_MESSAGE],
    errorCode: "metered_output_missing",
    incidentCategory: "completion_contradiction",
    message: SETTLED_OUTPUT_MISSING_FAILURE_MESSAGE,
  },
  {
    fragments: ["meteringreconciliationrequirederror", ...UNRESOLVED_METERING_MESSAGES],
    errorCode: "metering_reconciliation_required",
    incidentCategory: "unresolved_metering",
    message: UNRESOLVED_METERING_FAILURE_MESSAGE,
  },
  {
    fragments: ["ended before a complete result was available", "meteredoutputdeliveryerror"],
    errorCode: outputDeliveryCode,
    message: "A provider answer could not be delivered as a complete result.",
    // The usage detail is generated by `MeteredOutputDeliveryError` as token
    // counts and nothing else. Spelling that out matters: a permissive
    // `[\w, ]{1,60}` here would pass "...; Mira set the lantern down" through
    // verbatim into a persisted run row.
    verbatim:
      /^[A-Za-z][\w.-]* ended before a complete result was available \(finish reason: [\w-]+(?:; \d+ output tokens)?(?:(?:; |, )\d+ reasoning tokens)?\)\.$/,
    stageFromOperation: true,
  },
  {
    fragments: ["input is too large", "meteredinputlimiterror"],
    errorCode: "provider_input_limit",
    message: "One writing step exceeded the input size the provider accepts.",
    verbatim:
      /^[A-Za-z][\w.-]* input is too large \(\d+ bytes; maximum \d+ before provider schemas\)$/,
    stageFromOperation: true,
  },
  {
    fragments: [
      "prompt is too long",
      "context length",
      "context_length_exceeded",
      "request too large",
      "maximum input",
    ],
    errorCode: "provider_input_limit",
    message: "One writing step exceeded the input size the provider accepts.",
  },
  {
    fragments: ["timed out", "timeout", "etimedout", "deadline exceeded"],
    errorCode: "provider_timeout",
    message: "A provider call timed out before it returned a result.",
  },
  {
    fragments: ["rate limit", "rate_limit", "too many requests", "quota exceeded"],
    patterns: [STATUS_CODE(/429/)],
    errorCode: "provider_rate_limited",
    message: "The provider rate limited this account and the call was not repeated.",
  },
  {
    fragments: [
      "service unavailable",
      "internal server error",
      "bad gateway",
      "overloaded",
      "upstream connect error",
    ],
    patterns: [STATUS_CODE(/5\d\d/)],
    errorCode: "provider_unavailable",
    message: "The provider was unavailable for this call.",
  },
];

/** Operation prefixes carry the stage a metered call belonged to. */
const OPERATION_STAGES: Record<string, string> = {
  concept: "concept",
  creative: "concept",
  outliner: "outline",
  entity: "bible",
  writer: "chapters",
  editor: "editing",
  summarizer: "continuity",
  continuity: "continuity",
};

function operationStage(error: unknown): string | undefined {
  const role = extractedFailureMessage(error)?.split(/[\s.]/, 1)[0]?.toLowerCase();
  return role ? OPERATION_STAGES[role] : undefined;
}

function matchFailureSignature(serialized: string): FailureSignature | undefined {
  return FAILURE_SIGNATURES.find(
    (signature) =>
      signature.fragments?.some((fragment) => serialized.includes(fragment)) ||
      signature.patterns?.some((pattern) => pattern.test(serialized)),
  );
}

/**
 * Workflow may return a structured-clone-shaped object instead of an Error, so
 * the realm of the value says nothing about how trustworthy its text is. Read
 * only own name/message/cause fields, recognize the failure family from them,
 * and emit either a fixed operator phrasing or a message whose exact shape this
 * codebase generates itself. Arbitrary provider text — which can quote a prompt
 * or the manuscript — is never returned, in either realm.
 */
export function authoringFailureMessage(error: unknown, fallback = "Generation failed"): string {
  const signature = matchFailureSignature(failureStrings(error).join(" ").toLowerCase());
  if (!signature) return fallback;
  if (signature.verbatim) {
    const own = sanitizedFailureMessage(error);
    if (own && signature.verbatim.test(own)) return own;
  }
  return signature.message;
}

/**
 * Workflow step errors may cross a serialization boundary that changes their
 * concrete class to FatalError. Classify from both the durable name and the
 * stable, non-sensitive operator message so the initiating cause is not lost
 * to a generic `authoring_failed` cleanup record.
 */
export function classifyAuthoringFailure(error: unknown): AuthoringFailureDetails {
  const serialized = failureStrings(error).join(" ").toLowerCase();
  const signature = matchFailureSignature(serialized);
  if (!signature) return {};
  const stage = signature.stageFromOperation ? operationStage(error) : undefined;
  return {
    errorCode:
      typeof signature.errorCode === "function"
        ? signature.errorCode(serialized)
        : signature.errorCode,
    ...(stage ? { errorStage: stage } : {}),
    ...(signature.incidentCategory ? { incidentCategory: signature.incidentCategory } : {}),
  };
}

/** Whether repeating the same production is likely to change the outcome. */
export type AuthoringRetryOutlook = "worth_retrying" | "wait_and_retry" | "not_worth_retrying";

export type AuthoringFailureExplanation = {
  /** One plain sentence naming the cause. Never an error code. */
  cause: string;
  /** What the author still has, in their terms. */
  preserved: string;
  retry: AuthoringRetryOutlook;
  /** The retry outlook stated outright, for email and for the recovery card. */
  retryStatement: string;
  /** The single next thing the author should do. */
  nextStep: string;
};

const RETRY_STATEMENTS: Record<AuthoringRetryOutlook, string> = {
  worth_retrying: "This is worth trying again.",
  wait_and_retry: "This usually clears by itself — wait a few minutes, then try again.",
  not_worth_retrying:
    "Trying again right now would end the same way, so we would rather look at it first.",
};

const CONTINUE_FROM_SAVED_WORK =
  "Pick up from your saved work when you are ready; nothing already written is rewritten.";
const CONTACT_SUPPORT_WITH_REFERENCE =
  "Send us the support reference below and we will sort out the step that failed.";

const STAGE_PHRASES: Record<string, string> = {
  concept: " while it was developing your concept",
  outline: " while it was writing the outline",
  bible: " while it was building the story bible",
  chapters: " while it was drafting chapters",
  editing: " while it was editing your chapters",
  continuity: " during the final read-through for continuity",
  revising: " while it was applying the continuity notes",
  finalizing: " while it was finishing the manuscript",
};

type ExplanationCopy = {
  cause: (where: string) => string;
  retry: AuthoringRetryOutlook;
  nextStep: string;
};

const DEFAULT_EXPLANATION: ExplanationCopy = {
  cause: (where) => `Production stopped before the manuscript was finished${where}.`,
  retry: "worth_retrying",
  nextStep: `${CONTINUE_FROM_SAVED_WORK} If it stops again, ${CONTACT_SUPPORT_WITH_REFERENCE.toLowerCase()}`,
};

/**
 * Author-facing wording for every code `classifyAuthoringFailure` can record.
 * An author has no idea what a finish reason or a metering intent is: say what
 * happened to their book, and whether trying again is worth their money.
 */
const EXPLANATIONS: Record<string, ExplanationCopy> = {
  provider_output_invalid: {
    cause: (where) => `The Studio could not read the answer it got back${where}.`,
    retry: "not_worth_retrying",
    nextStep: `Asking for exactly the same thing again would return the same unreadable answer, so production stopped instead of charging you for repeats. ${CONTACT_SUPPORT_WITH_REFERENCE}`,
  },
  provider_output_truncated: {
    cause: (where) => `An answer ran out of room before it finished${where}.`,
    retry: "worth_retrying",
    nextStep: CONTINUE_FROM_SAVED_WORK,
  },
  provider_content_filtered: {
    cause: (where) => `The writing model declined to complete a request${where}.`,
    retry: "not_worth_retrying",
    nextStep:
      "Rewording the sensitive part of your brief usually clears this. Support can help you phrase it.",
  },
  provider_input_limit: {
    cause: (where) => `There was more material than could be sent in one step${where}.`,
    retry: "not_worth_retrying",
    nextStep:
      "Shorter chapters, or fewer of them, fit inside the limit. Support can also raise it for this book.",
  },
  provider_rate_limited: {
    cause: (where) => `The writing service was too busy to take the request${where}.`,
    retry: "wait_and_retry",
    nextStep: CONTINUE_FROM_SAVED_WORK,
  },
  provider_unavailable: {
    cause: (where) => `The writing service was briefly unavailable${where}.`,
    retry: "wait_and_retry",
    nextStep: CONTINUE_FROM_SAVED_WORK,
  },
  provider_timeout: {
    cause: (where) => `A step took longer than allowed and was stopped${where}.`,
    retry: "wait_and_retry",
    nextStep: CONTINUE_FROM_SAVED_WORK,
  },
  metering_reconciliation_required: {
    cause: (where) =>
      `The Studio could not confirm what an earlier paid step actually cost${where}, so it stopped rather than repeat it.`,
    retry: "not_worth_retrying",
    nextStep: `We check this by hand so you are never billed twice. ${CONTACT_SUPPORT_WITH_REFERENCE}`,
  },
  metered_output_missing: {
    cause: (where) => `A paid step was recorded as finished${where}, but its result never arrived.`,
    retry: "not_worth_retrying",
    nextStep: `We check this by hand so you are never billed twice. ${CONTACT_SUPPORT_WITH_REFERENCE}`,
  },
  authoring_cancelled: {
    cause: (where) => `Production stopped because a stop was requested${where}.`,
    retry: "worth_retrying",
    nextStep: CONTINUE_FROM_SAVED_WORK,
  },
  authoring_run_inactive: {
    cause: (where) => `This run had already ended elsewhere${where}.`,
    retry: "not_worth_retrying",
    nextStep: "Open your saved work to see where the manuscript stands.",
  },
  authoring_precondition: {
    cause: (where) => `A step could not run because this book's records had changed${where}.`,
    retry: "worth_retrying",
    nextStep: CONTINUE_FROM_SAVED_WORK,
  },
};

function preservedWork(savedChapterCount: number | undefined): string {
  if (savedChapterCount === undefined) return "Every chapter written so far is saved.";
  if (savedChapterCount <= 0) return "No chapter had been written yet, so nothing was lost.";
  if (savedChapterCount === 1) return "The chapter already written is saved and safe.";
  return `All ${savedChapterCount} chapters written so far are saved and safe.`;
}

/**
 * Turns a recorded failure into the four things an author needs: what went
 * wrong, what they still have, whether another attempt is worth it, and what
 * to do now. Never surfaces the error code itself — that belongs in the
 * diagnostics an operator reads.
 */
export function authoringFailureExplanation(input: {
  errorCode?: string | null;
  errorStage?: string | null;
  savedChapterCount?: number;
}): AuthoringFailureExplanation {
  const copy = EXPLANATIONS[input.errorCode?.trim().toLowerCase() ?? ""] ?? DEFAULT_EXPLANATION;
  const where = STAGE_PHRASES[input.errorStage?.trim().toLowerCase() ?? ""] ?? "";
  return {
    cause: copy.cause(where),
    preserved: preservedWork(input.savedChapterCount),
    retry: copy.retry,
    retryStatement: RETRY_STATEMENTS[copy.retry],
    nextStep: copy.nextStep,
  };
}

/**
 * Codes whose failure repeats identically on the same request. An operator who
 * retries these bills the author again for a guaranteed failure.
 */
export const DETERMINISTIC_AUTHORING_FAILURE_CODES: ReadonlySet<string> = new Set([
  "provider_output_invalid",
  "provider_content_filtered",
  "provider_input_limit",
]);

/** Codes that clear on their own once the provider recovers. */
export const TRANSIENT_AUTHORING_FAILURE_CODES: ReadonlySet<string> = new Set([
  "provider_output_truncated",
  "provider_rate_limited",
  "provider_unavailable",
  "provider_timeout",
]);

/** Codes where paid work is unaccounted for and nothing may restart. */
export const UNRECONCILED_AUTHORING_FAILURE_CODES: ReadonlySet<string> = new Set([
  "metering_reconciliation_required",
  "metered_output_missing",
]);

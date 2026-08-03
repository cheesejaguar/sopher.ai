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
 * Workflow may return a structured-clone-shaped object instead of an Error.
 * Read only own name/message/cause fields; never stringify the object, where
 * prompts or manuscript content could be attached by an upstream provider.
 */
export function authoringFailureMessage(error: unknown, fallback = "Generation failed"): string {
  const serialized = failureStrings(error).join(" ").toLowerCase();
  if (serialized.includes(SETTLED_OUTPUT_MISSING_MESSAGE)) {
    return SETTLED_OUTPUT_MISSING_FAILURE_MESSAGE;
  }
  if (
    serialized.includes("meteringreconciliationrequirederror") ||
    UNRESOLVED_METERING_MESSAGES.some((fragment) => serialized.includes(fragment))
  ) {
    return UNRESOLVED_METERING_FAILURE_MESSAGE;
  }
  // Serialized Workflow objects may carry provider or author content in an
  // otherwise ordinary-looking message. Preserve legacy Error behavior, but
  // never persist arbitrary fields from a plain structured-clone object.
  return error instanceof Error ? (extractedFailureMessage(error) ?? fallback) : fallback;
}

/**
 * Workflow step errors may cross a serialization boundary that changes their
 * concrete class to FatalError. Classify from both the durable name and the
 * stable, non-sensitive operator message so the initiating cause is not lost
 * to a generic `authoring_failed` cleanup record.
 */
export function classifyAuthoringFailure(error: unknown): AuthoringFailureDetails {
  const serialized = failureStrings(error).join(" ").toLowerCase();
  if (serialized.includes(SETTLED_OUTPUT_MISSING_MESSAGE)) {
    return {
      errorCode: "metered_output_missing",
      incidentCategory: "completion_contradiction",
    };
  }
  if (
    serialized.includes("meteringreconciliationrequirederror") ||
    UNRESOLVED_METERING_MESSAGES.some((fragment) => serialized.includes(fragment))
  ) {
    return {
      errorCode: "metering_reconciliation_required",
      incidentCategory: "unresolved_metering",
    };
  }
  return {};
}

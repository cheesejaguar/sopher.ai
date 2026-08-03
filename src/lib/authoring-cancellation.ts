import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";

export const AUTHORING_CANCELLATION_MESSAGE = "Authoring cancellation requested";
export const AUTHORING_RUN_INACTIVE_MESSAGE = "Generation run is no longer active";

export class AuthoringCancellationRequestedError extends Error {
  readonly isRetryable = false;

  constructor() {
    super(AUTHORING_CANCELLATION_MESSAGE);
    this.name = "AuthoringCancellationRequestedError";
  }
}

export class AuthoringRunInactiveError extends Error {
  readonly isRetryable = false;

  constructor() {
    super(AUTHORING_RUN_INACTIVE_MESSAGE);
    this.name = "AuthoringRunInactiveError";
  }
}

/**
 * Called after provider settlement and before output delivery. Work already
 * in flight is charged accurately, but its output cannot mutate the book
 * after the author requested a safe stop.
 */
export async function throwIfAuthoringCancellationRequested(runId?: string | null): Promise<void> {
  if (!runId) return;
  const [run] = await getDb()
    .select({
      status: schema.generationRuns.status,
      cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
    })
    .from(schema.generationRuns)
    .where(eq(schema.generationRuns.id, runId))
    .limit(1);
  if (run?.cancellationRequestedAt || run?.status === "cancelled") {
    throw new AuthoringCancellationRequestedError();
  }
  if (!run || run.status === "failed" || run.status === "completed") {
    throw new AuthoringRunInactiveError();
  }
}

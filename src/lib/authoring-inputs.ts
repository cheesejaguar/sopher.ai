import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb, schema, withDbTransaction } from "@/db";
import type { AuthoringRunInputKind } from "@/db/schema";
import type { AuthoringPauseDetails } from "@/db/schema";
import { AuthoringCancellationRequestedError } from "@/lib/authoring-cancellation";

export type AuthoringPause = {
  kind: AuthoringRunInputKind;
  version: number;
  token: string;
  registeredAt: Date | null;
  details: AuthoringPauseDetails | null;
};

export type DurableAuthoringInput = {
  id: string;
  kind: AuthoringRunInputKind;
  pauseVersion: number;
  payload: Record<string, unknown>;
  status: "accepted" | "delivered" | "consumed";
};

export function authoringInputToken(input: {
  runId: string;
  kind: AuthoringRunInputKind;
  pauseVersion: number;
}): string {
  return `authoring-input:${input.runId}:${input.kind}:${input.pauseVersion}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function authoringInputPayloadsEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

/**
 * Allocates a pause version without making it actionable. The caller must
 * register the Workflow hook first, then call markAuthoringPauseRegistered.
 */
export async function allocateAuthoringPause(input: {
  runId: string;
  projectId: string;
  userId: string;
  kind: AuthoringRunInputKind;
  pauseKey: string;
  details?: AuthoringPauseDetails;
}): Promise<AuthoringPause> {
  return withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${input.projectId}, 0)
      )`,
    );
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:authoring-pause:' || ${input.runId}, 0)
      )`,
    );
    const [run] = await tx
      .select({
        status: schema.generationRuns.status,
        kind: schema.generationRuns.pauseKind,
        version: schema.generationRuns.pauseVersion,
        key: schema.generationRuns.pauseKey,
        registeredAt: schema.generationRuns.pauseRegisteredAt,
        details: schema.generationRuns.pauseDetails,
        cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
      })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.id, input.runId),
          eq(schema.generationRuns.projectId, input.projectId),
          eq(schema.generationRuns.userId, input.userId),
        ),
      )
      .limit(1);
    if (run?.cancellationRequestedAt || run?.status === "cancelled") {
      throw new AuthoringCancellationRequestedError();
    }
    if (!run || !["queued", "running", "awaiting_input"].includes(run.status)) {
      throw new Error("Generation run is no longer active");
    }
    if (run.key === input.pauseKey && run.kind === input.kind) {
      return {
        kind: input.kind,
        version: run.version,
        token: authoringInputToken({
          runId: input.runId,
          kind: input.kind,
          pauseVersion: run.version,
        }),
        registeredAt: run.registeredAt,
        details: run.details,
      };
    }

    const version = run.version + 1;
    const [updated] = await tx
      .update(schema.generationRuns)
      .set({
        pauseKind: input.kind,
        pauseVersion: version,
        pauseKey: input.pauseKey,
        pauseDetails: input.details ?? null,
        pauseRegisteredAt: null,
        heartbeatAt: new Date(),
      })
      .where(
        and(
          eq(schema.generationRuns.id, input.runId),
          isNull(schema.generationRuns.cancellationRequestedAt),
          sql`${schema.generationRuns.status} in ('queued', 'running', 'awaiting_input')`,
        ),
      )
      .returning({ id: schema.generationRuns.id });
    if (!updated) throw new Error("Generation run is no longer active");
    return {
      kind: input.kind,
      version,
      token: authoringInputToken({
        runId: input.runId,
        kind: input.kind,
        pauseVersion: version,
      }),
      registeredAt: null,
      details: input.details ?? null,
    };
  });
}

export async function markAuthoringPauseRegistered(input: {
  runId: string;
  projectId: string;
  userId: string;
  kind: AuthoringRunInputKind;
  pauseVersion: number;
}): Promise<boolean> {
  const now = new Date();
  const [updated] = await getDb()
    .update(schema.generationRuns)
    .set({
      status: "awaiting_input",
      pauseRegisteredAt: now,
      heartbeatAt: now,
    })
    .where(
      and(
        eq(schema.generationRuns.id, input.runId),
        eq(schema.generationRuns.projectId, input.projectId),
        eq(schema.generationRuns.userId, input.userId),
        eq(schema.generationRuns.pauseKind, input.kind),
        eq(schema.generationRuns.pauseVersion, input.pauseVersion),
        isNull(schema.generationRuns.cancellationRequestedAt),
        sql`${schema.generationRuns.status} in ('queued', 'running', 'awaiting_input')`,
      ),
    )
    .returning({ id: schema.generationRuns.id });
  return Boolean(updated);
}

export async function acceptAuthoringRunInput(input: {
  runId: string;
  userId: string;
  kind: AuthoringRunInputKind;
  pauseVersion: number;
  payload: Record<string, unknown>;
  requestKey?: string;
}): Promise<{ input: DurableAuthoringInput; replayed: boolean }> {
  return withDbTransaction(async (tx) => {
    // Cancellation uses this same project-scoped lock. Re-read the run only
    // after acquiring it so an input can never be accepted from a stale
    // pre-cancellation snapshot.
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || project_id::text, 0)
      )
      from generation_runs
      where id = ${input.runId} and user_id = ${input.userId}`,
    );
    const [run] = await tx
      .select({
        kind: schema.generationRuns.pauseKind,
        version: schema.generationRuns.pauseVersion,
        registeredAt: schema.generationRuns.pauseRegisteredAt,
        status: schema.generationRuns.status,
        cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
      })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.id, input.runId),
          eq(schema.generationRuns.userId, input.userId),
        ),
      )
      .limit(1);
    if (
      !run ||
      run.status !== "awaiting_input" ||
      !run.registeredAt ||
      run.kind !== input.kind ||
      run.version !== input.pauseVersion ||
      run.cancellationRequestedAt
    ) {
      throw new Error("Run is not waiting for this input");
    }

    const [inserted] = await tx
      .insert(schema.authoringRunInputs)
      .values({
        runId: input.runId,
        kind: input.kind,
        pauseVersion: input.pauseVersion,
        ...(input.requestKey ? { requestKey: input.requestKey } : {}),
        payload: input.payload,
      })
      .onConflictDoNothing()
      .returning();
    const row =
      inserted ??
      (
        await tx
          .select()
          .from(schema.authoringRunInputs)
          .where(
            and(
              eq(schema.authoringRunInputs.runId, input.runId),
              eq(schema.authoringRunInputs.kind, input.kind),
              eq(schema.authoringRunInputs.pauseVersion, input.pauseVersion),
            ),
          )
          .limit(1)
      )[0];
    if (!row) throw new Error("Authoring input could not be accepted");
    // Postgres jsonb does not preserve object key insertion order. Compare a
    // canonical representation so an identical response-loss retry cannot be
    // rejected merely because the database returned its keys in another order.
    if (!authoringInputPayloadsEqual(row.payload, input.payload)) {
      throw new Error("This authoring input was already answered differently");
    }
    return {
      input: {
        id: row.id,
        kind: row.kind,
        pauseVersion: row.pauseVersion,
        payload: row.payload,
        status: row.status,
      },
      replayed: !inserted,
    };
  });
}

export async function markAuthoringRunInputDelivered(inputId: string): Promise<void> {
  await getDb()
    .update(schema.authoringRunInputs)
    .set({
      status: "delivered",
      deliveredAt: new Date(),
      deliveryAttempts: sql`${schema.authoringRunInputs.deliveryAttempts} + 1`,
      lastDeliveryError: null,
    })
    .where(
      and(
        eq(schema.authoringRunInputs.id, inputId),
        sql`${schema.authoringRunInputs.status} in ('accepted', 'delivered')`,
      ),
    );
}

export async function markAuthoringRunInputDeliveryFailed(
  inputId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await getDb()
    .update(schema.authoringRunInputs)
    .set({
      deliveryAttempts: sql`${schema.authoringRunInputs.deliveryAttempts} + 1`,
      lastDeliveryError: message.slice(0, 500),
    })
    .where(eq(schema.authoringRunInputs.id, inputId));
}

export async function deliverAuthoringRunInput(input: {
  inputId: string;
  token: string;
}): Promise<"delivered" | "already_delivered" | "already_consumed"> {
  const [row] = await getDb()
    .select({ status: schema.authoringRunInputs.status })
    .from(schema.authoringRunInputs)
    .where(eq(schema.authoringRunInputs.id, input.inputId))
    .limit(1);
  if (!row) throw new Error("Authoring input not found");
  if (row.status === "consumed") return "already_consumed";
  if (row.status === "delivered") return "already_delivered";

  try {
    const { resumeHook } = await import("workflow/api");
    await resumeHook(input.token, { inputId: input.inputId });
    await markAuthoringRunInputDelivered(input.inputId);
    return "delivered";
  } catch (error) {
    await markAuthoringRunInputDeliveryFailed(input.inputId, error);
    throw error;
  }
}

/**
 * Evidence-gated operator/watchdog redelivery. Only the currently registered
 * pause, still marked accepted after the response-loss grace, is eligible.
 */
export async function redeliverAcceptedAuthoringRunInput(input: {
  inputId: string;
  minimumAgeMs?: number;
}): Promise<"delivered" | "already_delivered" | "already_consumed" | "not_eligible"> {
  return withDbTransaction(async (tx) => {
    // Hold the same lock as cancellation through hook delivery. A cancellation
    // that wins first makes this ineligible; one that arrives later waits for
    // this already accepted redelivery to finish, then stops subsequent work.
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || runs.project_id::text, 0)
      )
      from authoring_run_inputs inputs
      join generation_runs runs on runs.id = inputs.run_id
      where inputs.id = ${input.inputId}`,
    );
    const [row] = await tx
      .select({
        id: schema.authoringRunInputs.id,
        runId: schema.authoringRunInputs.runId,
        kind: schema.authoringRunInputs.kind,
        pauseVersion: schema.authoringRunInputs.pauseVersion,
        status: schema.authoringRunInputs.status,
        acceptedAt: schema.authoringRunInputs.acceptedAt,
        runStatus: schema.generationRuns.status,
        runPauseKind: schema.generationRuns.pauseKind,
        runPauseVersion: schema.generationRuns.pauseVersion,
        pauseRegisteredAt: schema.generationRuns.pauseRegisteredAt,
        cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
      })
      .from(schema.authoringRunInputs)
      .innerJoin(
        schema.generationRuns,
        eq(schema.generationRuns.id, schema.authoringRunInputs.runId),
      )
      .where(eq(schema.authoringRunInputs.id, input.inputId))
      .limit(1);
    if (!row) return "not_eligible";
    if (row.status === "consumed") return "already_consumed";
    if (row.status === "delivered") return "already_delivered";
    const minimumAgeMs = input.minimumAgeMs ?? 30_000;
    if (
      row.runStatus !== "awaiting_input" ||
      row.runPauseKind !== row.kind ||
      row.runPauseVersion !== row.pauseVersion ||
      !row.pauseRegisteredAt ||
      row.cancellationRequestedAt ||
      Date.now() - row.acceptedAt.getTime() < minimumAgeMs
    ) {
      return "not_eligible";
    }
    return deliverAuthoringRunInput({
      inputId: row.id,
      token: authoringInputToken({
        runId: row.runId,
        kind: row.kind,
        pauseVersion: row.pauseVersion,
      }),
    });
  });
}

/**
 * A hook carries only the durable input id. The workflow consumes the stored
 * payload under the expected pause version, so duplicate hook deliveries
 * cannot be mistaken for a later pause on the same run.
 */
export async function consumeAuthoringRunInput(input: {
  runId: string;
  kind: AuthoringRunInputKind;
  pauseVersion: number;
  inputId: string;
}): Promise<Record<string, unknown> | null> {
  return withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:authoring-input:' || ${input.runId}, 0)
      )`,
    );
    const [row] = await tx
      .select()
      .from(schema.authoringRunInputs)
      .where(
        and(
          eq(schema.authoringRunInputs.id, input.inputId),
          eq(schema.authoringRunInputs.runId, input.runId),
          eq(schema.authoringRunInputs.kind, input.kind),
          eq(schema.authoringRunInputs.pauseVersion, input.pauseVersion),
        ),
      )
      .limit(1);
    if (!row) return null;
    if (row.status !== "consumed") {
      await tx
        .update(schema.authoringRunInputs)
        .set({ status: "consumed", consumedAt: new Date(), lastDeliveryError: null })
        .where(eq(schema.authoringRunInputs.id, row.id));
    }
    return row.payload;
  });
}

export async function clearAuthoringPause(input: {
  runId: string;
  kind: AuthoringRunInputKind;
  pauseVersion: number;
}): Promise<void> {
  await getDb()
    .update(schema.generationRuns)
    .set({
      status: "running",
      pauseKind: null,
      pauseKey: null,
      pauseDetails: null,
      pauseRegisteredAt: null,
      heartbeatAt: new Date(),
    })
    .where(
      and(
        eq(schema.generationRuns.id, input.runId),
        eq(schema.generationRuns.pauseKind, input.kind),
        eq(schema.generationRuns.pauseVersion, input.pauseVersion),
        isNull(schema.generationRuns.cancellationRequestedAt),
      ),
    );
}

import { and, eq, max, sql } from "drizzle-orm";

import { schema, withDbTransaction, type DbTransaction } from "@/db";
import type { RunEvent } from "@/lib/run-events";

export type PersistedRunEvent = {
  id: string;
  seq: number;
  inserted: boolean;
};

/**
 * Allocates from both the v2 counter and the durable event table. Callers must
 * hold the run-events advisory lock for this run. Consulting max(seq) keeps
 * current code compatible with deployment-pinned v1 workflows that still
 * append events without advancing next_event_seq.
 */
export async function nextRunEventSequence(
  tx: DbTransaction,
  runId: string,
  nextEventSeq: number,
): Promise<number> {
  const [existingSequence] = await tx
    .select({ maxSeq: max(schema.generationEvents.seq) })
    .from(schema.generationEvents)
    .where(eq(schema.generationEvents.runId, runId))
    .limit(1);
  return Math.max(nextEventSeq, Number(existingSequence?.maxSeq ?? 0) + 1);
}

/**
 * Persists the event and its canonical progress projection under one run lock.
 * The Workflow step id is the idempotency key, so replay returns the original
 * sequence instead of racing max(seq) or duplicating a user-visible update.
 */
export async function persistRunEvent(input: {
  runId: string;
  eventKey: string;
  event: RunEvent;
}): Promise<PersistedRunEvent> {
  return withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:run-events:' || ${input.runId}, 0)
      )`,
    );

    const [existing] = await tx
      .select({ id: schema.generationEvents.id, seq: schema.generationEvents.seq })
      .from(schema.generationEvents)
      .where(
        and(
          eq(schema.generationEvents.runId, input.runId),
          eq(schema.generationEvents.eventKey, input.eventKey),
        ),
      )
      .limit(1);
    if (existing) return { ...existing, inserted: false };

    const [run] = await tx
      .select({ nextEventSeq: schema.generationRuns.nextEventSeq })
      .from(schema.generationRuns)
      .where(eq(schema.generationRuns.id, input.runId))
      .limit(1);
    if (!run) throw new Error("Generation run not found while persisting progress");
    const allocatedSeq = await nextRunEventSequence(tx, input.runId, run.nextEventSeq);

    const now = new Date();
    const [inserted] = await tx
      .insert(schema.generationEvents)
      .values({
        runId: input.runId,
        seq: allocatedSeq,
        eventKey: input.eventKey,
        type: input.event.type,
        payload: input.event,
        createdAt: now,
      })
      .returning({ id: schema.generationEvents.id, seq: schema.generationEvents.seq });
    if (!inserted) throw new Error("Generation event was not persisted");

    const progress =
      input.event.type === "stage"
        ? {
            currentStage: input.event.stage,
            progressPct: input.event.pct,
            stageDescription: input.event.detail ?? null,
            lastProgressAt: now,
          }
        : input.event.type === "error"
          ? {
              currentStage: "failed" as const,
              stageDescription: input.event.message,
              lastProgressAt: now,
            }
          : {};
    await tx
      .update(schema.generationRuns)
      .set({
        nextEventSeq: allocatedSeq + 1,
        heartbeatAt: now,
        ...progress,
      })
      .where(eq(schema.generationRuns.id, input.runId));

    return { ...inserted, inserted: true };
  });
}

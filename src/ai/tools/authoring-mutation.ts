import { createHash } from "node:crypto";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { schema, withDbTransaction, type DbTransaction } from "@/db";
import {
  AuthoringCancellationRequestedError,
  AuthoringRunInactiveError,
} from "@/lib/authoring-cancellation";
import { nextRunEventSequence } from "@/lib/run-event-store";

export type AuthoringToolMutationContext = {
  runId?: string;
  userId: string;
  projectId: string;
  bookId: string;
  chapterNumber?: number;
  /** Stable logical Workflow step scope for tool-call replay identity. */
  mutationScope?: string;
  /** Per-agent-call ordinal, reset on compensated Workflow retries. */
  nextMutationOrdinal?: () => number;
};

export class AuthoringToolMutationReplayConflictError extends Error {
  constructor() {
    super("The replayed authoring tool call no longer matches its durable mutation");
    this.name = "AuthoringToolMutationReplayConflictError";
  }
}

/**
 * A stable call position is only a locator, never proof that regenerated model
 * output represents the same mutation. The semantic digest is the proof.
 */
export function assertAuthoringToolMutationReplayCompatible(
  storedSemanticKey: string | null | undefined,
  requestedSemanticKey: string,
): void {
  if (storedSemanticKey !== requestedSemanticKey) {
    throw new AuthoringToolMutationReplayConflictError();
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function authoringToolMutationKey(input: {
  toolName: string;
  chapterNumber?: number;
  payload: unknown;
}): string {
  const digest = createHash("sha256").update(canonicalJson(input.payload)).digest("hex");
  return `tool:${input.toolName}:${input.chapterNumber ?? 0}:${digest}`;
}

/**
 * Makes model-invoked canon mutations cancellation-safe and replay-safe.
 *
 * The project lock is shared with Stop, run creation, settings, deletion, and
 * manuscript commits. The run-event lock gives each semantic tool call one
 * durable, content-free marker. A Workflow or provider replay therefore
 * returns a harmless replay result instead of appending the same fact, issue,
 * or relationship twice.
 */
export async function withAuthoringToolMutation<T>(input: {
  ctx: AuthoringToolMutationContext;
  toolName: string;
  toolCallId?: string;
  logicalOrdinal?: number;
  payload: unknown;
  mutate: (tx: DbTransaction) => Promise<T>;
  replay: (tx: DbTransaction) => Promise<T> | T;
  /** Failed/no-op lookups must remain retryable after their prerequisites change. */
  shouldRecord?: (value: T) => boolean;
}): Promise<T> {
  const runId = input.ctx.runId;
  if (!runId) throw new AuthoringRunInactiveError();
  const semanticKey = authoringToolMutationKey({
    toolName: input.toolName,
    chapterNumber: input.ctx.chapterNumber,
    payload: input.payload,
  });
  const stableIdentity =
    input.ctx.mutationScope && input.logicalOrdinal !== undefined
      ? `${input.ctx.mutationScope}:${input.toolName}:ordinal:${input.logicalOrdinal}`
      : input.ctx.mutationScope && input.toolCallId
        ? `${input.ctx.mutationScope}:${input.toolName}:provider:${input.toolCallId}`
        : null;
  const eventKey = stableIdentity
    ? `tool-call:${createHash("sha256").update(stableIdentity).digest("hex")}`
    : semanticKey;

  return withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${input.ctx.projectId}, 0)
      )`,
    );
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:run-events:' || ${runId}, 0)
      )`,
    );

    const [run] = await tx
      .select({
        status: schema.generationRuns.status,
        cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
        nextEventSeq: schema.generationRuns.nextEventSeq,
      })
      .from(schema.generationRuns)
      .innerJoin(
        schema.books,
        and(eq(schema.books.id, input.ctx.bookId), eq(schema.books.projectId, input.ctx.projectId)),
      )
      .where(
        and(
          eq(schema.generationRuns.id, runId),
          eq(schema.generationRuns.projectId, input.ctx.projectId),
          eq(schema.generationRuns.userId, input.ctx.userId),
        ),
      )
      .limit(1);
    if (run?.cancellationRequestedAt || run?.status === "cancelled") {
      throw new AuthoringCancellationRequestedError();
    }
    if (!run || !["queued", "running", "awaiting_input"].includes(run.status)) {
      throw new AuthoringRunInactiveError();
    }

    const [existing] = await tx
      .select({
        id: schema.generationEvents.id,
        semanticKey: sql<string | null>`${schema.generationEvents.payload}->>'semanticKey'`,
      })
      .from(schema.generationEvents)
      .where(
        and(
          eq(schema.generationEvents.runId, runId),
          or(
            eq(schema.generationEvents.eventKey, eventKey),
            sql`${schema.generationEvents.payload}->>'semanticKey' = ${semanticKey}`,
          ),
        ),
      )
      .limit(1);
    if (existing) {
      assertAuthoringToolMutationReplayCompatible(existing.semanticKey, semanticKey);
      return input.replay(tx);
    }

    const value = await input.mutate(tx);
    if (input.shouldRecord && !input.shouldRecord(value)) return value;
    const allocatedSeq = await nextRunEventSequence(tx, runId, run.nextEventSeq);
    const now = new Date();
    await tx.insert(schema.generationEvents).values({
      runId,
      seq: allocatedSeq,
      eventKey,
      type: "tool_mutation",
      payload: {
        tool: input.toolName,
        chapterNumber: input.ctx.chapterNumber ?? null,
        logicalOrdinal: input.logicalOrdinal ?? null,
        semanticKey,
      },
      createdAt: now,
    });
    const [advanced] = await tx
      .update(schema.generationRuns)
      .set({
        nextEventSeq: allocatedSeq + 1,
        heartbeatAt: now,
      })
      .where(
        and(
          eq(schema.generationRuns.id, runId),
          inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
          isNull(schema.generationRuns.cancellationRequestedAt),
        ),
      )
      .returning({ id: schema.generationRuns.id });
    if (!advanced) throw new AuthoringCancellationRequestedError();
    return value;
  });
}

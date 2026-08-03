import { and, count, eq, lte, sql } from "drizzle-orm";

import { schema, withDbTransaction } from "@/db";

export const MAX_AUTHORING_STREAMS_PER_RUN = 12;
export const MAX_AUTHORING_STREAMS_PER_USER = 24;
const STREAM_LEASE_SECONDS = 330;

export async function acquireAuthoringStreamLease(input: {
  runId: string;
  userId: string;
  namespace: string;
}): Promise<string | null> {
  return withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:authoring-stream-user:' || ${input.userId}, 0)
      )`,
    );
    await tx
      .delete(schema.authoringStreamLeases)
      .where(
        and(
          eq(schema.authoringStreamLeases.userId, input.userId),
          lte(schema.authoringStreamLeases.expiresAt, sql`now()`),
        ),
      );
    const [activeForRun] = await tx
      .select({ value: count() })
      .from(schema.authoringStreamLeases)
      .where(
        and(
          eq(schema.authoringStreamLeases.runId, input.runId),
          eq(schema.authoringStreamLeases.userId, input.userId),
        ),
      );
    const [activeForUser] = await tx
      .select({ value: count() })
      .from(schema.authoringStreamLeases)
      .where(eq(schema.authoringStreamLeases.userId, input.userId));
    if (
      (activeForRun?.value ?? 0) >= MAX_AUTHORING_STREAMS_PER_RUN ||
      (activeForUser?.value ?? 0) >= MAX_AUTHORING_STREAMS_PER_USER
    ) {
      return null;
    }

    const [lease] = await tx
      .insert(schema.authoringStreamLeases)
      .values({
        runId: input.runId,
        userId: input.userId,
        namespace: input.namespace,
        expiresAt: sql`now() + (${STREAM_LEASE_SECONDS} * interval '1 second')`,
      })
      .returning({ id: schema.authoringStreamLeases.id });
    if (!lease) throw new Error("Authoring stream lease was not created");
    return lease.id;
  });
}

export async function releaseAuthoringStreamLease(input: {
  id: string;
  runId: string;
  userId: string;
}): Promise<void> {
  await withDbTransaction(async (tx) => {
    await tx
      .delete(schema.authoringStreamLeases)
      .where(
        and(
          eq(schema.authoringStreamLeases.id, input.id),
          eq(schema.authoringStreamLeases.runId, input.runId),
          eq(schema.authoringStreamLeases.userId, input.userId),
        ),
      );
  });
}

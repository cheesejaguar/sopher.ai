import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { getDb, getSqlClient, schema } from "@/db";
import { releaseRunCreditReservations } from "@/lib/billing/credits";

export const ACTIVE_AUTHORING_RUN_STATUSES = ["queued", "running", "awaiting_input"] as const;

/**
 * Authoring runs own manuscript, outline, and canon mutations until they stop.
 * Export is deliberately excluded: it is read-only and the database's active
 * run uniqueness rule permits it alongside production.
 */
export async function hasActiveAuthoringRun(projectId: string): Promise<boolean> {
  const [active] = await getDb()
    .select({ id: schema.generationRuns.id })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        inArray(schema.generationRuns.status, [...ACTIVE_AUTHORING_RUN_STATUSES]),
        ne(schema.generationRuns.kind, "export"),
      ),
    )
    .limit(1);
  return Boolean(active);
}

export async function assertNoActiveAuthoringRun(
  projectId: string,
  message = "Finish or stop the current run before changing the manuscript",
): Promise<void> {
  if (await hasActiveAuthoringRun(projectId)) throw new Error(message);
}

/**
 * Statement-level mutation guard. Put this in the same UPDATE/DELETE predicate
 * as the chapter version CAS so a run that already exists makes the write a
 * no-op instead of relying on an earlier read-only check.
 */
export function noActiveAuthoringRunSql(projectId: string) {
  return sql<boolean>`not exists (
    select 1
    from ${schema.generationRuns}
    where ${schema.generationRuns.projectId} = ${projectId}
      and ${schema.generationRuns.status} in ('queued', 'running', 'awaiting_input')
      and ${schema.generationRuns.kind} <> 'export'
  )`;
}

export async function insertQueuedAuthoringRun(input: {
  projectId: string;
  userId: string;
  kind: "full_book" | "chapter" | "edit_pass" | "continuity";
  config: unknown;
}): Promise<{ id: string }> {
  const client = getSqlClient();
  const configJson = JSON.stringify(input.config);
  const [, inserted] = await client.transaction((tx) => [
    tx`select pg_advisory_xact_lock(
      hashtextextended('sopher:project-authoring:' || ${input.projectId}, 0)
    )`,
    tx`
      insert into generation_runs (project_id, user_id, kind, status, config)
      values (
        ${input.projectId},
        ${input.userId},
        ${input.kind},
        'queued',
        ${configJson}::jsonb
      )
      returning id
    `,
  ]);
  const run = (inserted as Array<{ id: string }>)[0];
  if (!run) throw new Error("Could not create generation run");
  return run;
}

export type AuthoringRunStatus =
  "queued" | "running" | "awaiting_input" | "completed" | "failed" | "cancelled";

/**
 * Transition a run and its project while holding the same locks used by
 * project deletion and wallet metering. Terminal state is therefore a primary
 * provider-dispatch barrier even if the optional close marker cannot persist.
 */
export async function transitionAuthoringRunState(input: {
  runId: string;
  projectId: string;
  userId: string;
  status: Exclude<AuthoringRunStatus, "queued">;
  error?: string;
}): Promise<{ status: AuthoringRunStatus | null; transitioned: boolean }> {
  const terminal = ["completed", "failed", "cancelled"].includes(input.status);
  return getDb().transaction(async (tx) => {
    // Keep one global order anywhere both locks are needed: project, then
    // wallet. Metering takes only the wallet lock and asset writes only the
    // project lock, so neither can observe a half-terminal transition.
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${input.projectId}, 0)
      )`,
    );
    if (terminal) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`);
      try {
        // A savepoint lets a close-marker-specific failure roll back without
        // sacrificing the wallet-locked terminal status update.
        await tx.transaction(async (savepoint) => {
          await savepoint
            .insert(schema.creditLedger)
            .values({
              userId: input.userId,
              amount: "0",
              kind: "adjustment",
              description: "Close generation reservations after active calls settle",
              projectId: input.projectId,
              runId: input.runId,
              externalRef: `reservation-close-request:${input.runId}`,
            })
            .onConflictDoNothing({ target: schema.creditLedger.externalRef });
        });
      } catch (error) {
        console.error("Could not persist reservation close request", {
          runId: input.runId,
          error,
        });
      }
    }

    const [updated] = await tx
      .update(schema.generationRuns)
      .set({
        status: input.status,
        error: input.error ?? null,
        ...(input.status === "running" ? { startedAt: new Date() } : {}),
        ...(terminal ? { completedAt: new Date() } : {}),
      })
      .where(
        and(
          eq(schema.generationRuns.id, input.runId),
          eq(schema.generationRuns.userId, input.userId),
          eq(schema.generationRuns.projectId, input.projectId),
          inArray(schema.generationRuns.status, [...ACTIVE_AUTHORING_RUN_STATUSES]),
        ),
      )
      .returning({ status: schema.generationRuns.status });

    let currentStatus = updated?.status as AuthoringRunStatus | undefined;
    if (!currentStatus) {
      const [current] = await tx
        .select({ status: schema.generationRuns.status })
        .from(schema.generationRuns)
        .where(
          and(
            eq(schema.generationRuns.id, input.runId),
            eq(schema.generationRuns.userId, input.userId),
            eq(schema.generationRuns.projectId, input.projectId),
          ),
        )
        .limit(1);
      currentStatus = current?.status as AuthoringRunStatus | undefined;
    }

    if (currentStatus) {
      let projectStatus: "draft" | "generating" | "editing" | undefined;
      if (currentStatus === "running" || currentStatus === "awaiting_input") {
        projectStatus = "generating";
      } else if (currentStatus === "completed") {
        projectStatus = "editing";
      } else if (currentStatus === "failed" || currentStatus === "cancelled") {
        const [writtenChapter] = await tx
          .select({ id: schema.chapters.id })
          .from(schema.chapters)
          .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
          .where(
            and(
              eq(schema.books.projectId, input.projectId),
              sql`length(${schema.chapters.content}) > 0`,
            ),
          )
          .limit(1);
        projectStatus = writtenChapter ? "editing" : "draft";
      }
      if (projectStatus) {
        await tx
          .update(schema.projects)
          .set({ status: projectStatus, updatedAt: new Date() })
          .where(
            and(eq(schema.projects.id, input.projectId), eq(schema.projects.userId, input.userId)),
          );
      }
    }

    return { status: currentStatus ?? null, transitioned: Boolean(updated) };
  });
}

export async function terminalizeAuthoringRun(input: {
  runId: string;
  projectId: string;
  userId: string;
  status: "failed" | "cancelled";
  error?: string;
  /** Safe only when no provider call can still be executing. */
  releaseImmediately?: boolean;
}): Promise<void> {
  await transitionAuthoringRunState(input);

  if (input.releaseImmediately) {
    try {
      await releaseRunCreditReservations({ userId: input.userId, runId: input.runId });
    } catch (error) {
      // A terminal-run reconciliation pass runs before the user's next
      // reservation. Do not turn a successfully terminalized run back into a
      // visible startup/cancellation failure.
      console.error("Could not immediately release terminal run reservations", {
        runId: input.runId,
        error,
      });
    }
  }
}

export async function scheduleRunReservationCleanup(input: {
  userId: string;
  runId: string;
}): Promise<void> {
  try {
    const [{ start }, { cleanupRunReservationsAfterCancellation }] = await Promise.all([
      import("workflow/api"),
      import("@/workflows/cleanup-reservations"),
    ]);
    await start(cleanupRunReservationsAfterCancellation, [input.userId, input.runId]);
  } catch (error) {
    // reserveCredits() also reconciles aged terminal holds. This durable
    // cleanup is the prompt path; the sweeper is the backstop.
    console.error("Could not schedule terminal reservation cleanup", {
      runId: input.runId,
      error,
    });
  }
}

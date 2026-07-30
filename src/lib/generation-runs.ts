import { and, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";

import { getDb, getSqlClient, schema, withDbTransaction } from "@/db";
import { releaseRunCreditReservations } from "@/lib/billing/credits";
import { isE2EWorkflowStubEnabled } from "@/lib/e2e-workflow-stub";

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
  if (!active) return false;

  try {
    const { reconcileActiveAuthoringRuns } = await import("@/lib/run-health");
    await reconcileActiveAuthoringRuns({ projectId });
  } catch (error) {
    // A transient Workflow API error must never make an active database row
    // disappear from conflict checks.
    console.error("Could not reconcile authoring run before conflict check", {
      projectId,
      error,
    });
    return true;
  }

  const [remaining] = await getDb()
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
  return Boolean(remaining);
}

export async function assertNoActiveAuthoringRun(
  projectId: string,
  message = "Finish or stop the current run before changing the manuscript",
): Promise<void> {
  if (await hasActiveAuthoringRun(projectId)) throw new Error(message);
}

/**
 * Integration seam for Workflow-aware reconciliation. The run-health layer
 * replaces this no-op with a terminal-state check before conflict decisions;
 * callers deliberately await it so a dead remote workflow cannot block a
 * project forever.
 */
export async function reconcileBeforeAuthoringRunConflict(_input: {
  projectId: string;
  userId: string;
}): Promise<void> {
  try {
    const [active] = await getDb()
      .select({ id: schema.generationRuns.id })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.projectId, _input.projectId),
          inArray(schema.generationRuns.status, [...ACTIVE_AUTHORING_RUN_STATUSES]),
          ne(schema.generationRuns.kind, "export"),
        ),
      )
      .limit(1);
    if (!active) return;

    const { reconcileActiveAuthoringRuns } = await import("@/lib/run-health");
    await reconcileActiveAuthoringRuns({ projectId: _input.projectId });
  } catch (error) {
    // Preserve the database conflict when Workflow is unavailable.
    console.error("Could not reconcile authoring run before start", {
      projectId: _input.projectId,
      error,
    });
  }
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

export class RunRequestKeyMismatchError extends Error {
  constructor(
    readonly requestedKind: "full_book" | "chapter" | "edit_pass" | "continuity",
    readonly persistedKind: "full_book" | "chapter" | "edit_pass" | "continuity",
  ) {
    super(
      `Generation request key belongs to ${persistedKind}, not the requested ${requestedKind} operation`,
    );
    this.name = "RunRequestKeyMismatchError";
  }
}

export class TrialOptionalWorkInProgressError extends Error {
  constructor() {
    super("Finish the current optional AI tool before starting production");
    this.name = "TrialOptionalWorkInProgressError";
  }
}

export async function insertQueuedAuthoringRun(input: {
  projectId: string;
  userId: string;
  kind: "full_book" | "chapter" | "edit_pass" | "continuity";
  config: unknown;
  requestKey?: string;
}): Promise<{
  id: string;
  inserted: boolean;
  status: AuthoringRunStatus;
  workflowRunId: string | null;
  kind: "full_book" | "chapter" | "edit_pass" | "continuity";
  config: unknown;
}> {
  const client = getSqlClient();
  const configJson = JSON.stringify(input.config);
  const [, , inserted] = await client.transaction((tx) => [
    tx`select pg_advisory_xact_lock(
      hashtextextended('sopher:project-authoring:' || ${input.projectId}, 0)
    )`,
    tx`
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        optional_lease.user_id,
        0,
        'adjustment',
        'Repair optional operation lease from durable project output',
        optional_lease.project_id,
        null,
        'release:' || optional_lease.external_ref
      from credit_ledger optional_lease
      where optional_lease.project_id = ${input.projectId}
        and optional_lease.external_ref like 'optional-operation-lease:%'
        and not exists (
          select 1
          from credit_ledger released
          where released.external_ref = 'release:' || optional_lease.external_ref
        )
        and exists (
          select 1
          from (
            select asset.meta->>'operationKey' as operation_key
            from assets asset
            where asset.project_id = ${input.projectId}
            union all
            select tool_run.input->>'operationKey' as operation_key
            from content_tool_runs tool_run
            where tool_run.project_id = ${input.projectId}
            union all
            select suggestion.anchor->>'operationKey' as operation_key
            from suggestions suggestion
            inner join chapters chapter on chapter.id = suggestion.chapter_id
            inner join books book on book.id = chapter.book_id
            where book.project_id = ${input.projectId}
          ) delivered
          where delivered.operation_key is not null
            and optional_lease.external_ref like
              ('%:' || delivered.operation_key || ':%')
        )
      on conflict (external_ref) do nothing
    `,
    tx`
      insert into generation_runs (
        project_id,
        user_id,
        request_key,
        kind,
        status,
        config,
        acceptance_uncertain_at,
        acceptance_dispatch_claimed_at
      )
      select
        ${input.projectId},
        ${input.userId},
        ${input.requestKey ?? null},
        ${input.kind},
        'queued',
        ${configJson}::jsonb,
        now(),
        now()
      where not exists (
        select 1
        from credit_ledger optional_lease
        where optional_lease.project_id = ${input.projectId}
          and optional_lease.external_ref like 'optional-operation-lease:%'
          and not exists (
            select 1
            from credit_ledger released_lease
            where released_lease.external_ref = 'release:' || optional_lease.external_ref
          )
      )
      and not exists (
        select 1
        from projects project
        where project.id = ${input.projectId}
          and project.user_id = ${input.userId}
          and project.experience = 'trial_short_story'
          and exists (
            select 1
            from credit_ledger optional_intent
            where optional_intent.project_id = project.id
              and optional_intent.user_id = ${input.userId}
              and optional_intent.run_id is null
              and optional_intent.amount = 0
              and coalesce(optional_intent.external_ref, '') like 'metering-intent:%'
              and not exists (
                select 1
                from credit_ledger terminal_intent
                where terminal_intent.external_ref in (
                  'intent-settled:' || optional_intent.external_ref,
                  'intent-aborted:' || optional_intent.external_ref
                )
              )
          )
      )
      on conflict (project_id, request_key) do update
        set request_key = excluded.request_key
      returning
        id,
        kind,
        config,
        status,
        workflow_run_id,
        (xmax = 0) as inserted
    `,
  ]);
  const run = (
    inserted as Array<{
      id: string;
      inserted: boolean;
      kind: "full_book" | "chapter" | "edit_pass" | "continuity";
      config: unknown;
      status: AuthoringRunStatus;
      workflow_run_id: string | null;
    }>
  )[0];
  if (!run) throw new TrialOptionalWorkInProgressError();
  if (run.kind !== input.kind) {
    throw new RunRequestKeyMismatchError(input.kind, run.kind);
  }
  return {
    id: run.id,
    inserted: run.inserted,
    kind: run.kind,
    config: run.config,
    status: run.status,
    workflowRunId: run.workflow_run_id,
  };
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
  return withDbTransaction(async (tx) => {
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
        ...(terminal
          ? {
              completedAt: new Date(),
              acceptanceUncertainAt: null,
              acceptanceDispatchClaimedAt: null,
            }
          : {}),
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

/**
 * The workflow records its own durable identifier before doing any paid work.
 * This closes the crash window where start() succeeded but the caller died
 * before persisting the returned Workflow run id.
 */
export async function linkAuthoringRunWorkflow(input: {
  runId: string;
  projectId: string;
  userId: string;
  workflowRunId: string;
}): Promise<boolean> {
  const [linked] = await getDb()
    .update(schema.generationRuns)
    .set({
      workflowRunId: input.workflowRunId,
      acceptanceUncertainAt: null,
      acceptanceDispatchClaimedAt: null,
    })
    .where(
      and(
        eq(schema.generationRuns.id, input.runId),
        eq(schema.generationRuns.projectId, input.projectId),
        eq(schema.generationRuns.userId, input.userId),
        inArray(schema.generationRuns.status, [...ACTIVE_AUTHORING_RUN_STATUSES]),
        or(
          isNull(schema.generationRuns.workflowRunId),
          eq(schema.generationRuns.workflowRunId, input.workflowRunId),
        ),
      ),
    )
    .returning({ id: schema.generationRuns.id });
  return Boolean(linked);
}

/**
 * Records the one response-loss state that may be retried safely. The CAS
 * deliberately refuses running/terminal or already-linked rows.
 */
export async function markAuthoringRunAcceptanceUncertain(input: {
  runId: string;
  projectId: string;
  userId: string;
}): Promise<boolean> {
  const [marked] = await getDb()
    .update(schema.generationRuns)
    .set({
      acceptanceUncertainAt: new Date(),
      acceptanceDispatchClaimedAt: null,
    })
    .where(
      and(
        eq(schema.generationRuns.id, input.runId),
        eq(schema.generationRuns.projectId, input.projectId),
        eq(schema.generationRuns.userId, input.userId),
        eq(schema.generationRuns.status, "queued"),
        isNull(schema.generationRuns.workflowRunId),
      ),
    )
    .returning({ id: schema.generationRuns.id });
  return Boolean(marked);
}

/**
 * Isolated browser tests intentionally do not create a remote Workflow. Clear
 * the real dispatch markers only behind the explicit local stub gate so the
 * accepted fixture does not masquerade as an ambiguous production handoff.
 */
export async function settleStubbedAuthoringRunHandoff(input: {
  runId: string;
  projectId: string;
  userId: string;
}): Promise<boolean> {
  if (!isE2EWorkflowStubEnabled()) {
    throw new Error("Stubbed authoring handoff is unavailable outside isolated E2E");
  }
  const [settled] = await getDb()
    .update(schema.generationRuns)
    .set({
      acceptanceUncertainAt: null,
      acceptanceDispatchClaimedAt: null,
    })
    .where(
      and(
        eq(schema.generationRuns.id, input.runId),
        eq(schema.generationRuns.projectId, input.projectId),
        eq(schema.generationRuns.userId, input.userId),
        eq(schema.generationRuns.status, "queued"),
        isNull(schema.generationRuns.workflowRunId),
      ),
    )
    .returning({ id: schema.generationRuns.id });
  return Boolean(settled);
}

export type ClaimedUncertainAuthoringRun = {
  id: string;
  projectId: string;
  userId: string;
  kind: "full_book" | "chapter" | "edit_pass" | "continuity";
  config: unknown;
};

/**
 * Claims one same-run Workflow redispatch under the same project lock used by
 * generation creation. The durable marker remains; a short-lived claim keeps
 * concurrent clicks from dispatching twice and becomes retryable if a process
 * dies before it can release or self-link.
 */
export async function claimUncertainAuthoringRun(input: {
  runId: string;
  projectId: string;
  userId: string;
}): Promise<ClaimedUncertainAuthoringRun | null> {
  return withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${input.projectId}, 0)
      )`,
    );
    const staleBefore = new Date(Date.now() - 2 * 60_000);
    const [run] = await tx
      .update(schema.generationRuns)
      .set({ acceptanceDispatchClaimedAt: new Date() })
      .where(
        and(
          eq(schema.generationRuns.id, input.runId),
          eq(schema.generationRuns.projectId, input.projectId),
          eq(schema.generationRuns.userId, input.userId),
          eq(schema.generationRuns.status, "queued"),
          isNull(schema.generationRuns.workflowRunId),
          isNotNull(schema.generationRuns.acceptanceUncertainAt),
          sql`${schema.generationRuns.config}->>'dispatchReady' = 'true'`,
          or(
            isNull(schema.generationRuns.acceptanceDispatchClaimedAt),
            lte(schema.generationRuns.acceptanceDispatchClaimedAt, staleBefore),
          ),
        ),
      )
      .returning({
        id: schema.generationRuns.id,
        projectId: schema.generationRuns.projectId,
        userId: schema.generationRuns.userId,
        kind: schema.generationRuns.kind,
        config: schema.generationRuns.config,
      });
    if (!run) return null;
    if (
      run.kind !== "full_book" &&
      run.kind !== "chapter" &&
      run.kind !== "edit_pass" &&
      run.kind !== "continuity"
    ) {
      return null;
    }
    return {
      id: run.id,
      projectId: run.projectId,
      userId: run.userId,
      kind: run.kind,
      config: run.config,
    };
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

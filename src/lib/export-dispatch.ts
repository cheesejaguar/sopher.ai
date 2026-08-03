import "server-only";

import { and, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { getDb, schema, withDbTransaction } from "@/db";
import {
  linkAuthoringRunWorkflow,
  markAuthoringRunAcceptanceUncertain,
} from "@/lib/generation-runs";
import {
  deriveWorkflowMissingObservationTransition,
  hasConclusiveMissingWorkflowEvidence,
  readWorkflowSnapshot,
  type WorkflowHealthStatus,
} from "@/lib/run-health";
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/export/types";
import { FORMAT_META } from "@/lib/export/types";

// Export UI polls for one minute and the Workflow self-links before producing
// bytes, so a short lease gives response-loss recovery time without risking
// duplicate output. Competing accepted Workflows are stopped by the self-link.
export const EXPORT_DISPATCH_CLAIM_TTL_MS = 15_000;
export const EXPORT_RECONCILE_PROBE_INTERVAL_MS = 5_000;

export type ExportDispatchSnapshot = {
  id: string;
  projectId: string;
  userId: string;
  kind: string;
  status: string;
  config: unknown;
  workflowRunId: string | null;
  acceptanceUncertainAt: Date | null;
  acceptanceDispatchClaimedAt: Date | null;
  dispatchAttempts: number;
  workflowMissingCount?: number;
  workflowMissingSince?: Date | null;
};

export type ExportDispatchRecoveryAction = "none" | "wait" | "redispatch" | "fail";

export type ExportReconciliationOutcome =
  | "unchanged"
  | "redispatched"
  | "acceptance_uncertain"
  | "completed"
  | "failed"
  | "cancelled"
  | "error";

type ExportWorkflowObservation = {
  status: WorkflowHealthStatus;
  missingCount: number;
  missingSince: Date | null;
};

type LinkedExportReconciliationDependencies = {
  readWorkflow: typeof readWorkflowSnapshot;
  observeWorkflow: (
    run: ExportDispatchSnapshot,
    status: WorkflowHealthStatus,
  ) => Promise<ExportWorkflowObservation>;
  hasSavedAsset: (run: ExportDispatchSnapshot) => Promise<boolean>;
  transition: (
    run: ExportDispatchSnapshot,
    status: "completed" | "failed" | "cancelled",
    error: string | null,
  ) => Promise<boolean>;
};

export function exportDispatchRecoveryAction(
  run: ExportDispatchSnapshot,
  now = new Date(),
): ExportDispatchRecoveryAction {
  if (run.kind !== "export" || run.status !== "queued" || run.workflowRunId) return "none";
  const claimIsFresh = Boolean(
    run.acceptanceDispatchClaimedAt &&
    run.acceptanceDispatchClaimedAt.getTime() > now.getTime() - EXPORT_DISPATCH_CLAIM_TTL_MS,
  );
  const acceptanceUncertain =
    Boolean(run.acceptanceUncertainAt) || Boolean(run.acceptanceDispatchClaimedAt && !claimIsFresh);
  if (!acceptanceUncertain || claimIsFresh) return "wait";
  return run.dispatchAttempts >= 3 ? "fail" : "redispatch";
}

type ExportDispatchOutcome =
  | { outcome: "started" | "reattached"; workflowRunId: string }
  | { outcome: "acceptance_uncertain"; workflowRunId: null };

export async function dispatchExportWorkflow(input: {
  runId: string;
  projectId: string;
  userId: string;
  format: ExportFormat;
}): Promise<ExportDispatchOutcome> {
  try {
    const [{ start }, { exportBook }] = await Promise.all([
      import("workflow/api"),
      import("@/workflows/export"),
    ]);
    const workflow = await start(exportBook, [
      input.runId,
      input.projectId,
      input.userId,
      input.format,
    ]);
    const linked = await linkAuthoringRunWorkflow({
      runId: input.runId,
      projectId: input.projectId,
      userId: input.userId,
      workflowRunId: workflow.runId,
    });
    if (linked) return { outcome: "started", workflowRunId: workflow.runId };

    const [current] = await getDb()
      .select({ workflowRunId: schema.generationRuns.workflowRunId })
      .from(schema.generationRuns)
      .where(eq(schema.generationRuns.id, input.runId))
      .limit(1);
    if (current?.workflowRunId) {
      return { outcome: "reattached", workflowRunId: current.workflowRunId };
    }
  } catch (error) {
    console.error("Export Workflow acceptance could not be confirmed", {
      runId: input.runId,
      error,
    });
  }

  // start() may have committed remotely before its response or the redundant
  // caller-side link was lost. The Workflow self-links before rendering.
  await markAuthoringRunAcceptanceUncertain(input).catch((error) => {
    // The original dispatch lease remains durable and becomes recoverable when
    // it expires, even if this best-effort ambiguity marker cannot be written.
    console.error("Could not persist uncertain export acceptance", {
      runId: input.runId,
      error,
    });
  });
  return { outcome: "acceptance_uncertain", workflowRunId: null };
}

async function claimUncertainExportRun(
  run: ExportDispatchSnapshot,
): Promise<{ format: ExportFormat } | null> {
  return withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${run.projectId}, 0)
      )`,
    );
    const claimedAt = new Date();
    const staleBefore = new Date(claimedAt.getTime() - EXPORT_DISPATCH_CLAIM_TTL_MS);
    const [claimed] = await tx
      .update(schema.generationRuns)
      .set({
        acceptanceUncertainAt: claimedAt,
        acceptanceDispatchClaimedAt: claimedAt,
        dispatchAttempts: sql`${schema.generationRuns.dispatchAttempts} + 1`,
      })
      .where(
        and(
          eq(schema.generationRuns.id, run.id),
          eq(schema.generationRuns.projectId, run.projectId),
          eq(schema.generationRuns.userId, run.userId),
          eq(schema.generationRuns.kind, "export"),
          eq(schema.generationRuns.status, "queued"),
          isNull(schema.generationRuns.workflowRunId),
          or(
            isNotNull(schema.generationRuns.acceptanceUncertainAt),
            lte(schema.generationRuns.acceptanceDispatchClaimedAt, staleBefore),
          ),
          or(
            isNull(schema.generationRuns.acceptanceDispatchClaimedAt),
            lte(schema.generationRuns.acceptanceDispatchClaimedAt, staleBefore),
          ),
          sql`${schema.generationRuns.dispatchAttempts} < 3`,
        ),
      )
      .returning({ config: schema.generationRuns.config });
    if (!claimed) return null;
    const format = (claimed.config as { format?: unknown }).format;
    return EXPORT_FORMATS.includes(format as ExportFormat)
      ? { format: format as ExportFormat }
      : null;
  });
}

async function observeLinkedExportWorkflow(
  run: ExportDispatchSnapshot,
  status: WorkflowHealthStatus,
): Promise<ExportWorkflowObservation> {
  const observedAt = new Date();
  const transition = deriveWorkflowMissingObservationTransition({
    status,
    currentCount: run.workflowMissingCount ?? 0,
    currentSince: run.workflowMissingSince ?? null,
    observedAt,
  });
  const [observed] = await getDb()
    .update(schema.generationRuns)
    .set({
      workflowObservedStatus: status,
      workflowObservedAt: observedAt,
      healthCheckedAt: observedAt,
      workflowMissingCount:
        transition.mode === "increment"
          ? sql`${schema.generationRuns.workflowMissingCount} + 1`
          : transition.mode === "preserve"
            ? sql`${schema.generationRuns.workflowMissingCount}`
            : 0,
      workflowMissingSince:
        transition.mode === "increment"
          ? sql`coalesce(${schema.generationRuns.workflowMissingSince}, ${observedAt})`
          : transition.mode === "preserve"
            ? sql`${schema.generationRuns.workflowMissingSince}`
            : null,
    })
    .where(
      and(
        eq(schema.generationRuns.id, run.id),
        eq(schema.generationRuns.kind, "export"),
        inArray(schema.generationRuns.status, ["queued", "running"]),
      ),
    )
    .returning({
      missingCount: schema.generationRuns.workflowMissingCount,
      missingSince: schema.generationRuns.workflowMissingSince,
    });
  return {
    status,
    missingCount: observed?.missingCount ?? run.workflowMissingCount ?? 0,
    missingSince: observed?.missingSince ?? run.workflowMissingSince ?? null,
  };
}

async function exportHasSavedAsset(run: ExportDispatchSnapshot): Promise<boolean> {
  const format = (run.config as { format?: unknown }).format;
  if (!EXPORT_FORMATS.includes(format as ExportFormat)) return false;
  const [asset] = await getDb()
    .select({ id: schema.assets.id })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.projectId, run.projectId),
        eq(schema.assets.kind, FORMAT_META[format as ExportFormat].assetKind),
        sql`${schema.assets.meta}->>'runId' = ${run.id}`,
      ),
    )
    .limit(1);
  return Boolean(asset);
}

async function transitionExportRun(
  run: ExportDispatchSnapshot,
  status: "completed" | "failed" | "cancelled",
  error: string | null,
): Promise<boolean> {
  const [updated] = await getDb()
    .update(schema.generationRuns)
    .set({
      status,
      error,
      completedAt: new Date(),
      acceptanceUncertainAt: null,
      acceptanceDispatchClaimedAt: null,
    })
    .where(
      and(
        eq(schema.generationRuns.id, run.id),
        eq(schema.generationRuns.projectId, run.projectId),
        eq(schema.generationRuns.userId, run.userId),
        eq(schema.generationRuns.kind, "export"),
        inArray(schema.generationRuns.status, ["queued", "running"]),
      ),
    )
    .returning({ id: schema.generationRuns.id });
  return Boolean(updated);
}

/**
 * Repairs the crash window after an export Workflow reaches a terminal state
 * but its final database transition is lost. A completed Workflow is trusted
 * only when the immutable export asset exists; transient and single missing
 * observations preserve the run.
 */
export async function reconcileLinkedExportWorkflow(
  run: ExportDispatchSnapshot,
  dependencies: Partial<LinkedExportReconciliationDependencies> = {},
): Promise<ExportReconciliationOutcome> {
  if (
    run.kind !== "export" ||
    (run.status !== "queued" && run.status !== "running") ||
    !run.workflowRunId
  ) {
    return "unchanged";
  }

  const readWorkflow = dependencies.readWorkflow ?? readWorkflowSnapshot;
  const observeWorkflow = dependencies.observeWorkflow ?? observeLinkedExportWorkflow;
  const hasSavedAsset = dependencies.hasSavedAsset ?? exportHasSavedAsset;
  const transition = dependencies.transition ?? transitionExportRun;
  const workflow = await readWorkflow(run.workflowRunId);
  const observation = await observeWorkflow(run, workflow.status);

  if (workflow.status === "completed") {
    const saved = await hasSavedAsset(run);
    const nextStatus = saved ? "completed" : "failed";
    const changed = await transition(
      run,
      nextStatus,
      saved ? null : "The export Workflow completed without a saved export file",
    );
    return changed ? nextStatus : "unchanged";
  }
  if (workflow.status === "failed" || workflow.status === "cancelled") {
    const changed = await transition(
      run,
      workflow.status,
      workflow.status === "failed" ? "The export Workflow stopped before the file was saved" : null,
    );
    return changed ? workflow.status : "unchanged";
  }
  if (
    workflow.status === "missing" &&
    hasConclusiveMissingWorkflowEvidence({
      count: observation.missingCount,
      since: observation.missingSince,
    })
  ) {
    const saved = await hasSavedAsset(run);
    const nextStatus = saved ? "completed" : "failed";
    const changed = await transition(
      run,
      nextStatus,
      saved ? null : "The export Workflow could no longer be found and no export file was saved",
    );
    return changed ? nextStatus : "unchanged";
  }
  return "unchanged";
}

export async function reconcileExportDispatch(
  run: ExportDispatchSnapshot,
): Promise<"unchanged" | "redispatched" | "acceptance_uncertain" | "failed"> {
  const action = exportDispatchRecoveryAction(run);
  if (action === "none" || action === "wait") return "unchanged";
  if (action === "fail") {
    const [failed] = await getDb()
      .update(schema.generationRuns)
      .set({
        status: "failed",
        error: "The export could not be started after three dispatch attempts",
        completedAt: new Date(),
        acceptanceUncertainAt: null,
        acceptanceDispatchClaimedAt: null,
      })
      .where(
        and(
          eq(schema.generationRuns.id, run.id),
          eq(schema.generationRuns.projectId, run.projectId),
          eq(schema.generationRuns.userId, run.userId),
          eq(schema.generationRuns.kind, "export"),
          eq(schema.generationRuns.status, "queued"),
          isNull(schema.generationRuns.workflowRunId),
        ),
      )
      .returning({ id: schema.generationRuns.id });
    return failed ? "failed" : "unchanged";
  }

  const claimed = await claimUncertainExportRun(run);
  if (!claimed) return "unchanged";
  const outcome = await dispatchExportWorkflow({
    runId: run.id,
    projectId: run.projectId,
    userId: run.userId,
    format: claimed.format,
  });
  return outcome.outcome === "acceptance_uncertain" ? "acceptance_uncertain" : "redispatched";
}

/** Reconciles every active export without treating authoring work as blocked. */
export async function reconcileActiveExportRuns(input?: {
  projectId?: string;
  userId?: string;
  limit?: number;
}): Promise<Array<{ runId: string; outcome: ExportReconciliationOutcome }>> {
  const conditions = [
    eq(schema.generationRuns.kind, "export"),
    inArray(schema.generationRuns.status, ["queued", "running"]),
    or(
      isNull(schema.generationRuns.healthCheckedAt),
      lte(
        schema.generationRuns.healthCheckedAt,
        new Date(Date.now() - EXPORT_RECONCILE_PROBE_INTERVAL_MS),
      ),
    )!,
  ];
  if (input?.projectId) conditions.push(eq(schema.generationRuns.projectId, input.projectId));
  if (input?.userId) conditions.push(eq(schema.generationRuns.userId, input.userId));
  const runs = await getDb()
    .select()
    .from(schema.generationRuns)
    .where(and(...conditions))
    .orderBy(
      sql`coalesce(${schema.generationRuns.healthCheckedAt}, ${schema.generationRuns.createdAt})`,
      schema.generationRuns.createdAt,
    )
    .limit(Math.min(Math.max(input?.limit ?? 100, 1), 250));

  const results: Array<{ runId: string; outcome: ExportReconciliationOutcome }> = [];
  for (const run of runs) {
    try {
      if (!run.workflowRunId) {
        await getDb()
          .update(schema.generationRuns)
          .set({ healthCheckedAt: new Date() })
          .where(eq(schema.generationRuns.id, run.id));
      }
      const outcome = run.workflowRunId
        ? await reconcileLinkedExportWorkflow(run)
        : await reconcileExportDispatch(run);
      results.push({ runId: run.id, outcome });
    } catch (error) {
      console.error("Could not reconcile export run", { runId: run.id, error });
      results.push({ runId: run.id, outcome: "error" });
    }
  }
  return results;
}

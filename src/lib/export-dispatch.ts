import "server-only";

import { and, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { getDb, schema, withDbTransaction } from "@/db";
import {
  linkAuthoringRunWorkflow,
  markAuthoringRunAcceptanceUncertain,
} from "@/lib/generation-runs";
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/export/types";

// Export UI polls for one minute and the Workflow self-links before producing
// bytes, so a short lease gives response-loss recovery time without risking
// duplicate output. Competing accepted Workflows are stopped by the self-link.
export const EXPORT_DISPATCH_CLAIM_TTL_MS = 15_000;

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
};

export type ExportDispatchRecoveryAction = "none" | "wait" | "redispatch" | "fail";

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

import { and, eq, inArray } from "drizzle-orm";
import { getRun } from "workflow/api";

import { getDb, schema } from "@/db";
import {
  requestAuthoringRunCancellation,
  scheduleRunReservationCleanup,
} from "@/lib/generation-runs";
import { readWorkflowSnapshot, reconcileAuthoringRun } from "@/lib/run-health";

const ACTIVE_STATUSES = ["queued", "running", "awaiting_input"] as const;

/**
 * Clerk has already removed the identity, so no author input can ever resolve
 * an approval or credit pause. Mark every active local run first (blocking new
 * provider calls), then forward cancellation and reconcile authoritative
 * Workflow state. Replays are harmless.
 */
export async function requestDeletedClerkUserRunCancellations(userId: string): Promise<number> {
  const db = getDb();
  const runs = await db
    .select()
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.userId, userId),
        inArray(schema.generationRuns.status, [...ACTIVE_STATUSES]),
      ),
    );

  for (const run of runs) {
    const cancellation = await requestAuthoringRunCancellation({
      runId: run.id,
      projectId: run.projectId,
      userId,
      reason: "Clerk account deleted",
    });
    if (!cancellation?.requested) continue;
    if (cancellation.workflowRunId) {
      try {
        await getRun(cancellation.workflowRunId).cancel();
      } catch (error) {
        console.warn("Could not immediately cancel deleted account Workflow", {
          runId: cancellation.runId,
          workflowRunId: cancellation.workflowRunId,
          error,
        });
      }
    }
    await scheduleRunReservationCleanup({ userId, runId: cancellation.runId });
  }

  const remaining = await db
    .select()
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.userId, userId),
        inArray(schema.generationRuns.status, [...ACTIVE_STATUSES]),
      ),
    );
  for (const run of remaining) {
    if (run.kind !== "export") {
      await reconcileAuthoringRun(run);
      continue;
    }
    const workflow = await readWorkflowSnapshot(run.workflowRunId);
    if (
      workflow.status !== "completed" &&
      workflow.status !== "failed" &&
      workflow.status !== "cancelled"
    ) {
      continue;
    }
    await db
      .update(schema.generationRuns)
      .set({
        status: workflow.status,
        completedAt: workflow.completedAt ?? new Date(),
        cancellationRequestedAt: null,
        cancellationReason: null,
      })
      .where(
        and(
          eq(schema.generationRuns.id, run.id),
          eq(schema.generationRuns.userId, userId),
          inArray(schema.generationRuns.status, [...ACTIVE_STATUSES]),
        ),
      );
  }
  return runs.length;
}

export async function scheduleDeletedClerkUserFinalization(userId: string): Promise<void> {
  const [{ start }, { finalizeDeletedClerkUser }] = await Promise.all([
    import("workflow/api"),
    import("@/workflows/finalize-clerk-user-deletion"),
  ]);
  await start(finalizeDeletedClerkUser, [userId]);
}

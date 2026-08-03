"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema, withDbTransaction } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { grantCredits } from "@/lib/billing/credits";
import {
  reconcileMeteredCallAsCharged,
  reconcileMeteredCallAsUncharged,
} from "@/lib/billing/meter";
import {
  requestAuthoringRunCancellation,
  scheduleRunReservationCleanup,
} from "@/lib/generation-runs";
import { redispatchUncertainAuthoringRun } from "@/lib/authoring-dispatch";
import { redeliverAcceptedAuthoringRunInput } from "@/lib/authoring-inputs";
import { recordAuthoringIncident, resolveAuthoringIncident } from "@/lib/authoring-incidents";
import { reconcileAuthoringRun } from "@/lib/run-health";

/**
 * Admin actions. Every mutation is (a) behind requireAdmin, (b) auditable —
 * credit changes land in the append-only ledger with the acting admin in the
 * ref, flag reviews record the reviewer — and (c) reversible except where the
 * underlying system is (a cancelled run is cancelled).
 */

const adjustSchema = z.object({
  userId: z.string().min(1),
  credits: z.number().finite().min(-1000).max(1000),
  reason: z.string().min(3).max(300),
});

export async function adminAdjustCredits(input: unknown): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  const data = adjustSchema.parse(input);
  await grantCredits({
    userId: data.userId,
    credits: data.credits,
    description: `Adjustment: ${data.reason}`,
    // The acting admin travels in the idempotency ref — audit and uniqueness.
    externalRef: `admin:${adminId}:${crypto.randomUUID()}`,
    kind: "adjustment",
  });
  revalidatePath(`/admin/users/${data.userId}`);
  revalidatePath("/admin");
}

export async function adminSetSuspended(userId: string, suspended: boolean): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  // An admin cannot suspend themselves — trivially reversible otherwise, but
  // locking the only key in the car is not a state worth allowing.
  if (userId === adminId && suspended) throw new Error("You cannot suspend your own account");
  await withDbTransaction(async (tx) => {
    // Shared with provider authorization: once suspension commits, no later
    // metered call can race a stale precheck into the Gateway.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    await tx
      .update(schema.users)
      .set({ suspended, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function adminSetFlagStatus(
  flagId: string,
  status: "dismissed" | "actioned",
): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  if (!z.uuid().safeParse(flagId).success) throw new Error("Flag not found");
  await getDb()
    .update(schema.moderationFlags)
    .set({ status, reviewedBy: adminId })
    .where(eq(schema.moderationFlags.id, flagId));
  revalidatePath("/admin/flags");
}

/** Requests cancellation; reconciliation confirms the terminal state. */
export async function adminCancelRun(runId: string): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  if (!z.uuid().safeParse(runId).success) throw new Error("Run not found");
  const db = getDb();
  const [run] = await db
    .select({
      id: schema.generationRuns.id,
      status: schema.generationRuns.status,
      projectId: schema.generationRuns.projectId,
      userId: schema.generationRuns.userId,
      workflowRunId: schema.generationRuns.workflowRunId,
    })
    .from(schema.generationRuns)
    .where(eq(schema.generationRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("Run not found");
  if (!["queued", "running", "awaiting_input"].includes(run.status)) {
    await recordAdminRunAction({
      runId: run.id,
      projectId: run.projectId,
      adminId,
      action: "request_cancellation",
      outcome: "already_terminal",
    });
    return;
  }

  const cancellation = await requestAuthoringRunCancellation({
    runId,
    projectId: run.projectId,
    userId: run.userId,
    reason: "Cancelled by administrator",
  });
  if (!cancellation) throw new Error("Run not found");

  let workflowCancelOutcome = cancellation.requested ? "requested" : "already_requested";
  if (cancellation.workflowRunId) {
    try {
      const { getRun } = await import("workflow/api");
      await getRun(cancellation.workflowRunId).cancel();
      workflowCancelOutcome = `${workflowCancelOutcome}_workflow_notified`;
    } catch (error) {
      // The workflow may already be dead — the DB state is what users see.
      console.warn("[admin] workflow cancel failed:", error);
      workflowCancelOutcome = `${workflowCancelOutcome}_workflow_unconfirmed`;
    }
  }

  await scheduleRunReservationCleanup({ userId: run.userId, runId });
  await recordAdminRunAction({
    runId: run.id,
    projectId: run.projectId,
    adminId,
    action: "request_cancellation",
    outcome: workflowCancelOutcome,
  });
  revalidatePath(`/admin/runs/${runId}`);
  revalidatePath("/admin/runs");
}

/** Probes Workflow and applies only the evidence-gated reconciliation rules. */
export async function adminRecheckRun(runId: string): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  if (!z.uuid().safeParse(runId).success) throw new Error("Run not found");
  const [run] = await getDb()
    .select()
    .from(schema.generationRuns)
    .where(eq(schema.generationRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("Run not found");

  try {
    const result = await reconcileAuthoringRun(run);
    await recordAdminRunAction({
      runId: run.id,
      projectId: run.projectId,
      adminId,
      action: "recheck",
      outcome: `${result.outcome}:${result.workflowStatus}`,
    });
  } catch (error) {
    await recordAdminRunAction({
      runId: run.id,
      projectId: run.projectId,
      adminId,
      action: "recheck",
      outcome: "probe_error",
    });
    throw error;
  }
  revalidatePath(`/admin/runs/${runId}`);
  revalidatePath("/admin/runs");
}

async function recordAdminRunAction(input: {
  runId: string;
  projectId: string;
  adminId: string;
  action: "redispatch" | "redeliver_input" | "recheck" | "request_cancellation";
  outcome: string;
}): Promise<void> {
  const dedupeKey = `operator:${input.action}:${crypto.randomUUID()}`;
  await recordAuthoringIncident({
    runId: input.runId,
    projectId: input.projectId,
    category: "operator_action",
    severity: "warning",
    dedupeKey,
    evidence: {
      action: input.action,
      actorId: input.adminId,
      outcome: input.outcome,
    },
  });
  await resolveAuthoringIncident({ runId: input.runId, dedupeKey });
}

/**
 * Reuses the existing durable run after the dispatch lease expires. The
 * underlying claim enforces the attempt ceiling and refuses linked, cancelled,
 * non-queued, or otherwise ambiguous work.
 */
export async function adminRedispatchRun(runId: string): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  if (!z.uuid().safeParse(runId).success) throw new Error("Run not found");
  const [run] = await getDb()
    .select({
      id: schema.generationRuns.id,
      projectId: schema.generationRuns.projectId,
      userId: schema.generationRuns.userId,
    })
    .from(schema.generationRuns)
    .where(eq(schema.generationRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("Run not found");

  const result = await redispatchUncertainAuthoringRun({
    runId: run.id,
    projectId: run.projectId,
    userId: run.userId,
  });
  await recordAdminRunAction({
    runId: run.id,
    projectId: run.projectId,
    adminId,
    action: "redispatch",
    outcome: result.outcome,
  });
  if (result.outcome === "not_eligible" || result.outcome === "unsupported") {
    throw new Error("This run is not eligible for safe redispatch");
  }

  revalidatePath(`/admin/runs/${runId}`);
  revalidatePath("/admin/runs");
}

/**
 * Redelivers only a persisted, accepted response for the run's currently
 * registered pause. No author payload is copied into the audit record.
 */
export async function adminRedeliverRunInput(inputId: string): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  if (!z.uuid().safeParse(inputId).success) throw new Error("Input not found");
  const [input] = await getDb()
    .select({
      id: schema.authoringRunInputs.id,
      runId: schema.authoringRunInputs.runId,
      projectId: schema.generationRuns.projectId,
    })
    .from(schema.authoringRunInputs)
    .innerJoin(schema.generationRuns, eq(schema.generationRuns.id, schema.authoringRunInputs.runId))
    .where(eq(schema.authoringRunInputs.id, inputId))
    .limit(1);
  if (!input) throw new Error("Input not found");

  const outcome = await redeliverAcceptedAuthoringRunInput({
    inputId: input.id,
    minimumAgeMs: 0,
  });
  await recordAdminRunAction({
    runId: input.runId,
    projectId: input.projectId,
    adminId,
    action: "redeliver_input",
    outcome,
  });
  if (outcome === "not_eligible") {
    throw new Error("This input is no longer eligible for safe redelivery");
  }

  revalidatePath(`/admin/runs/${input.runId}`);
}

const reconcileIntentSchema = z.object({
  intentRef: z.string().startsWith("metering-intent:").max(1_000),
  confirmation: z.literal("verified_no_gateway_charge"),
  note: z.string().min(10).max(500),
});

/**
 * Releases an unresolved provider-call claim only after an administrator has
 * checked the Gateway generation record and explicitly attested it was not
 * charged. There is intentionally no generic "clear" action for ambiguity.
 */
export async function adminReconcileUnchargedMeteringIntent(input: unknown): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  const data = reconcileIntentSchema.parse(input);
  const released = await reconcileMeteredCallAsUncharged({
    intentRef: data.intentRef,
    adminId,
    note: data.note,
  });
  if (!released) {
    throw new Error("The intent is already resolved or no longer eligible for release");
  }
  revalidatePath("/admin/runs");
}

const chargedReconciliationSchema = z.object({
  intentRef: z.string().startsWith("metering-intent:").max(1_000),
  confirmation: z.literal("verified_gateway_charge"),
  note: z.string().min(10).max(500),
  calls: z
    .array(
      z.object({
        model: z.string().min(3).max(200),
        inputTokens: z.number().int().min(0).max(2_000_000),
        outputTokens: z.number().int().min(0).max(200_000),
        cachedInputTokens: z.number().int().min(0).max(2_000_000).default(0),
        cacheWriteTokens: z.number().int().min(0).max(2_000_000).default(0),
        reasoningTokens: z.number().int().min(0).max(200_000).default(0),
        imageCount: z.number().int().min(0).max(10).default(0),
      }),
    )
    .min(1)
    .max(5)
    .refine(
      (calls) =>
        calls.some(
          (call) =>
            call.inputTokens > 0 ||
            call.outputTokens > 0 ||
            call.cachedInputTokens > 0 ||
            call.cacheWriteTokens > 0 ||
            call.reasoningTokens > 0 ||
            call.imageCount > 0,
        ),
      { message: "A charged reconciliation requires positive billable usage" },
    ),
});

/** Settles an aged pending claim from usage verified in the Gateway dashboard. */
export async function adminReconcileChargedMeteringIntent(input: unknown): Promise<void> {
  const { userId: adminId } = await requireAdmin();
  const data = chargedReconciliationSchema.parse(input);
  await reconcileMeteredCallAsCharged({
    intentRef: data.intentRef,
    adminId,
    note: data.note,
    calls: data.calls,
  });
  revalidatePath("/admin/runs");
}

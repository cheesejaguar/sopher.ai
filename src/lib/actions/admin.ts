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
import { scheduleRunReservationCleanup, terminalizeAuthoringRun } from "@/lib/generation-runs";

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

/** Cancels a stuck run: workflow first (best effort), then the DB state. */
export async function adminCancelRun(runId: string): Promise<void> {
  await requireAdmin();
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
  if (!["queued", "running", "awaiting_input"].includes(run.status)) return;

  if (run.workflowRunId) {
    try {
      const { getRun } = await import("workflow/api");
      await getRun(run.workflowRunId).cancel();
    } catch (error) {
      // The workflow may already be dead — the DB state is what users see.
      console.warn("[admin] workflow cancel failed:", error);
    }
  }

  await terminalizeAuthoringRun({
    runId,
    projectId: run.projectId,
    userId: run.userId,
    status: "cancelled",
    error: "Cancelled by administrator",
  });
  await scheduleRunReservationCleanup({ userId: run.userId, runId });
  revalidatePath("/admin/runs");
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

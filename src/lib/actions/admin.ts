"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { grantCredits } from "@/lib/billing/credits";

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
  const db = getDb();
  await db
    .update(schema.users)
    .set({ suspended, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
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

  await db
    .update(schema.generationRuns)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(
      and(
        eq(schema.generationRuns.id, runId),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
      ),
    );
  await db
    .update(schema.projects)
    .set({ status: "draft", updatedAt: new Date() })
    .where(and(eq(schema.projects.id, run.projectId), eq(schema.projects.status, "generating")));
  revalidatePath("/admin/runs");
}

import { sleep } from "workflow";

import { withDbTransaction } from "@/db";
import { deleteClerkUserTransaction } from "@/lib/account-deletion-transaction";
import { reconcileCreditReservations } from "@/lib/billing/credits";
import { requestDeletedClerkUserRunCancellations } from "@/lib/clerk-deletion-finalizer";

type DeletionFinalizerOutcome =
  "deleted" | "already_deleted" | "retry" | "active_run" | "open_billing";

export async function finalizeDeletedClerkUserStep(
  userId: string,
): Promise<DeletionFinalizerOutcome> {
  "use step";
  await requestDeletedClerkUserRunCancellations(userId);
  await reconcileCreditReservations(userId);
  return withDbTransaction((tx) =>
    deleteClerkUserTransaction(tx, {
      userId,
      scheduleCleanup: async (cleanupInput) => {
        const [{ start }, { cleanupUserProjectBlobsAfterDelete }] = await Promise.all([
          import("workflow/api"),
          import("@/workflows/cleanup-project-blobs"),
        ]);
        await start(cleanupUserProjectBlobsAfterDelete, [cleanupInput]);
      },
    }),
  );
}

/**
 * Durable backstop for Clerk webhook retry exhaustion. Most deletions finish
 * on the first retry after Workflow cancellation; progressively slower polls
 * preserve ambiguous provider/billing work for up to thirty days.
 */
export async function finalizeDeletedClerkUser(userId: string): Promise<void> {
  "use workflow";
  for (let attempt = 0; attempt < 744; attempt += 1) {
    const outcome = await finalizeDeletedClerkUserStep(userId);
    if (outcome === "deleted" || outcome === "already_deleted") return;
    await sleep(attempt < 5 ? "1 minute" : attempt < 24 ? "15 minutes" : "1 hour");
  }
  throw new Error("Deleted Clerk account still has unresolved authoring or billing work");
}

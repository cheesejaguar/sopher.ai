import { sleep } from "workflow";

import { releaseRunCreditReservations } from "@/lib/billing/credits";

const RESERVATION_SETTLEMENT_GRACE = "1 hour";

async function releaseRunReservationsStep(userId: string, runId: string): Promise<void> {
  "use step";
  await releaseRunCreditReservations({ userId, runId });
}

/**
 * Run.cancel() records cancellation but does not wait for an already executing
 * provider step. Keep its hold unavailable through a conservative settlement
 * window, then release only the still-unconsumed remainder.
 */
export async function cleanupRunReservationsAfterCancellation(
  userId: string,
  runId: string,
): Promise<void> {
  "use workflow";
  await sleep(RESERVATION_SETTLEMENT_GRACE);
  await releaseRunReservationsStep(userId, runId);
}

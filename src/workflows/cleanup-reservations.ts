import { sleep } from "workflow";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { recordAuthoringIncident } from "@/lib/authoring-incidents";
import { releaseRunCreditReservations } from "@/lib/billing/credits";

const RESERVATION_SETTLEMENT_GRACE = "1 hour";
const MAX_TERMINAL_CHECKS = 24;

async function readRunCleanupStateStep(runId: string): Promise<{
  terminal: boolean;
  projectId: string | null;
}> {
  "use step";
  const [run] = await getDb()
    .select({
      status: schema.generationRuns.status,
      projectId: schema.generationRuns.projectId,
    })
    .from(schema.generationRuns)
    .where(eq(schema.generationRuns.id, runId))
    .limit(1);
  return {
    terminal: !run || ["completed", "failed", "cancelled"].includes(run.status),
    projectId: run?.projectId ?? null,
  };
}

async function releaseRunReservationsStep(userId: string, runId: string): Promise<void> {
  "use step";
  await releaseRunCreditReservations({ userId, runId });
}

async function recordUnconfirmedCleanupStep(input: {
  runId: string;
  projectId: string;
}): Promise<void> {
  "use step";
  await recordAuthoringIncident({
    runId: input.runId,
    projectId: input.projectId,
    category: "stale_reservation",
    severity: "critical",
    dedupeKey: "cancellation-cleanup-still-active",
    evidence: { terminalChecks: MAX_TERMINAL_CHECKS },
  });
}

/**
 * Run.cancel() records cancellation but does not wait for an already executing
 * provider step. Keep its hold unavailable through a conservative settlement
 * window, then release only after the run is authoritatively terminal. An
 * ambiguous active run keeps its hold; releasing it could let the same wallet
 * fund another provider call while the cancelled call is still settling.
 */
export async function cleanupRunReservationsAfterCancellation(
  userId: string,
  runId: string,
): Promise<void> {
  "use workflow";
  let lastProjectId: string | null = null;
  for (let check = 0; check < MAX_TERMINAL_CHECKS; check += 1) {
    await sleep(RESERVATION_SETTLEMENT_GRACE);
    const state = await readRunCleanupStateStep(runId);
    lastProjectId = state.projectId ?? lastProjectId;
    if (state.terminal) {
      await releaseRunReservationsStep(userId, runId);
      return;
    }
  }
  if (lastProjectId) {
    await recordUnconfirmedCleanupStep({ runId, projectId: lastProjectId });
  }
}

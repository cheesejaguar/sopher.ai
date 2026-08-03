import "server-only";

import { getAuthoringJourneySnapshot } from "@/db/queries/authoring-journey";
import type { AuthoringNextAction } from "@/lib/authoring-journey";

export type AuthoringStartSafetyBlock = {
  code: "support_required";
  supportReference: string;
  action: AuthoringNextAction & { kind: "contact_support" };
};

/**
 * A replacement run is safe only after the same Workflow-aware evidence used
 * by the project UI has been re-read on the server. Exact request-key replays
 * must be handled before this guard: returning an already-created run cannot
 * duplicate work, while inserting a new run in a contradictory state can.
 */
export async function getAuthoringStartSafetyBlock(input: {
  projectId: string;
  userId: string;
}): Promise<AuthoringStartSafetyBlock | null> {
  const snapshot = await getAuthoringJourneySnapshot(input);
  if (!snapshot || snapshot.nextAction.kind !== "contact_support") return null;

  return {
    code: "support_required",
    supportReference: snapshot.supportReference,
    action: snapshot.nextAction as AuthoringStartSafetyBlock["action"],
  };
}

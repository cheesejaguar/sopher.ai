import "server-only";

import { getAuthoringJourneySnapshot } from "@/db/queries/authoring-journey";
import { projectHasUnresolvedMetering } from "@/lib/billing/unresolved-metering";
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
  const [snapshot, unresolvedMetering] = await Promise.all([
    getAuthoringJourneySnapshot(input),
    projectHasUnresolvedMetering(input),
  ]);
  if (!snapshot) return null;

  if (snapshot.nextAction.kind !== "contact_support" && !unresolvedMetering) return null;

  const action: AuthoringStartSafetyBlock["action"] =
    snapshot.nextAction.kind === "contact_support"
      ? (snapshot.nextAction as AuthoringStartSafetyBlock["action"])
      : {
          kind: "contact_support",
          href: `mailto:support@sopher.ai?subject=${encodeURIComponent(
            `Authoring help · ${snapshot.supportReference}`,
          )}`,
          label: "Contact support",
          description:
            "A prior provider attempt has unresolved billing evidence. We will not restart or repeat that work until support verifies the provider outcome.",
          requiresMeteredAccess: false,
        };

  return {
    code: "support_required",
    supportReference: snapshot.supportReference,
    action,
  };
}

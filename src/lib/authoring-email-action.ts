import "server-only";

import type { AuthoringNextAction } from "@/lib/authoring-journey";

export type AuthoringEmailAction = Pick<AuthoringNextAction, "href" | "label">;

function supportFallback(reference: string): AuthoringEmailAction {
  const subject = encodeURIComponent(`Authoring help · ${reference}`);
  return {
    href: `mailto:support@sopher.ai?subject=${subject}`,
    label: "Contact support",
  };
}

/**
 * Recovery mail uses the same database-only journey snapshot as the Studio
 * library. Dynamic imports avoid a module cycle with run-health, which also
 * triggers this resolver after it has persisted a terminal transition.
 */
export async function resolveAuthoringEmailAction(input: {
  userId: string;
  projectId: string;
  supportReference: string;
}): Promise<AuthoringEmailAction> {
  try {
    const [{ listAuthoringJourneySnapshots }, { getStudioAccess }] = await Promise.all([
      import("@/db/queries/authoring-journey"),
      import("@/lib/studio-access"),
    ]);
    const snapshots = await listAuthoringJourneySnapshots(
      input.userId,
      getStudioAccess(input.userId),
    );
    const action = snapshots.find(
      (snapshot) => snapshot.project.id === input.projectId,
    )?.nextAction;
    return action
      ? { href: action.href, label: action.label }
      : supportFallback(input.supportReference);
  } catch (error) {
    console.warn("[email] could not resolve authoritative authoring action:", error);
    return supportFallback(input.supportReference);
  }
}

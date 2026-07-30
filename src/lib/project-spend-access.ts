import "server-only";

import { and, eq, gt, inArray } from "drizzle-orm";

import { getDb, schema } from "@/db";
import type { ProjectExperience } from "@/db/schema";

export class ProjectSpendAccessError extends Error {
  constructor(
    readonly code: "project_not_found" | "purchase_required" | "trial_busy" | "suspended",
    message: string,
  ) {
    super(message);
    this.name = "ProjectSpendAccessError";
  }
}

export type ProjectSpendAccess = {
  experience: ProjectExperience;
  fullBookUnlocked: boolean;
  /** Trial work must always be covered by prepaid balance or a parent hold. */
  allowCreditFloor: boolean;
};

export type ProjectSpendOperationKind = "authoring" | "whole_story_start" | "optional";

export function deriveProjectSpendAccess(input: {
  experience: ProjectExperience;
  isAdmin: boolean;
  hasSettledPurchase: boolean;
  suspended?: boolean;
  optionalWorkDuringActiveRun: boolean;
  wholeStoryStartAfterCompletion?: boolean;
}): ProjectSpendAccess {
  const fullBookUnlocked = input.isAdmin || input.hasSettledPurchase;
  if (input.suspended) {
    throw new ProjectSpendAccessError(
      "suspended",
      "This account is suspended and cannot use authoring tools",
    );
  }
  if (input.experience === "full_book" && !fullBookUnlocked) {
    throw new ProjectSpendAccessError(
      "purchase_required",
      "Purchase credits to use AI tools on this full-length project",
    );
  }
  if (
    input.experience === "trial_short_story" &&
    input.wholeStoryStartAfterCompletion &&
    !fullBookUnlocked
  ) {
    throw new ProjectSpendAccessError(
      "purchase_required",
      "Purchase credits to start another complete story",
    );
  }
  if (input.optionalWorkDuringActiveRun) {
    throw new ProjectSpendAccessError(
      "trial_busy",
      "Finish the current authoring run before using optional AI tools",
    );
  }
  return {
    experience: input.experience,
    fullBookUnlocked,
    allowCreditFloor: input.experience !== "trial_short_story",
  };
}

/**
 * Shared authorization boundary for every provider-backed project operation.
 * Read/manual-edit/export paths intentionally do not call this function.
 */
export async function assertProjectSpendAccess(input: {
  userId: string;
  projectId: string;
  operationKind?: ProjectSpendOperationKind;
}): Promise<ProjectSpendAccess> {
  const db = getDb();
  const [[project], [purchase], [user]] = await Promise.all([
    db
      .select({
        experience: schema.projects.experience,
        completedAt: schema.projects.completedAt,
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.userId, input.userId)))
      .limit(1),
    db
      .select({ id: schema.creditLedger.id })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.userId, input.userId),
          eq(schema.creditLedger.kind, "purchase"),
          gt(schema.creditLedger.amount, "0"),
        ),
      )
      .limit(1),
    db
      .select({ role: schema.users.role, suspended: schema.users.suspended })
      .from(schema.users)
      .where(eq(schema.users.id, input.userId))
      .limit(1),
  ]);

  if (!project) {
    throw new ProjectSpendAccessError("project_not_found", "Project not found");
  }
  let optionalWorkDuringActiveRun = false;
  let wholeStoryStartAfterCompletion =
    input.operationKind === "whole_story_start" && Boolean(project.completedAt);
  if ((input.operationKind ?? "optional") === "optional") {
    const [activeRun] = await db
      .select({ id: schema.generationRuns.id })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.projectId, input.projectId),
          inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
        ),
      )
      .limit(1);
    optionalWorkDuringActiveRun = Boolean(activeRun);
  }
  if (
    project.experience === "trial_short_story" &&
    input.operationKind === "whole_story_start" &&
    !wholeStoryStartAfterCompletion
  ) {
    const [completedRun] = await db
      .select({ id: schema.generationRuns.id })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.projectId, input.projectId),
          eq(schema.generationRuns.userId, input.userId),
          eq(schema.generationRuns.kind, "full_book"),
          eq(schema.generationRuns.status, "completed"),
        ),
      )
      .limit(1);
    wholeStoryStartAfterCompletion = Boolean(completedRun);
  }

  return deriveProjectSpendAccess({
    experience: project.experience,
    isAdmin: user?.role === "admin",
    hasSettledPurchase: Boolean(purchase),
    suspended: user?.suspended === true,
    optionalWorkDuringActiveRun,
    wholeStoryStartAfterCompletion,
  });
}

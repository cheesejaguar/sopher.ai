import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, gt, isNotNull, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import type { ProjectExperience } from "@/db/schema";
import { clerkEnabled } from "@/lib/clerk";
import { isE2ETrialUserId } from "@/lib/e2e-workflow-stub";
import { validFullBookCompletionExistsSql } from "@/lib/run-completion-proof";
export {
  assertProjectSpendAccess,
  ProjectSpendAccessError,
  type ProjectSpendAccess,
} from "@/lib/project-spend-access";

export type StudioAccessReason =
  "verify_email" | "trial_available" | "trial_exists" | "purchase_required" | "full_book_unlocked";

export type StudioAccess = {
  emailVerified: boolean;
  isAdmin: boolean;
  suspended: boolean;
  hasSettledPurchase: boolean;
  hasPriorMeteredUsage: boolean;
  fullBookUnlocked: boolean;
  trialProjectId: string | null;
  trialProjectCompleted: boolean;
  canCreateTrial: boolean;
  creationExperience: ProjectExperience | null;
  reason: StudioAccessReason;
};

export type StudioAccessFacts = Pick<
  StudioAccess,
  | "emailVerified"
  | "isAdmin"
  | "suspended"
  | "hasSettledPurchase"
  | "hasPriorMeteredUsage"
  | "trialProjectId"
  | "trialProjectCompleted"
>;

export function deriveStudioAccess(facts: StudioAccessFacts): StudioAccess {
  const fullBookUnlocked = facts.isAdmin || facts.hasSettledPurchase;
  if (fullBookUnlocked) {
    return {
      ...facts,
      fullBookUnlocked,
      canCreateTrial: false,
      creationExperience: "full_book",
      reason: "full_book_unlocked",
    };
  }
  if (facts.trialProjectId) {
    return {
      ...facts,
      fullBookUnlocked,
      canCreateTrial: false,
      creationExperience: null,
      reason: "trial_exists",
    };
  }
  if (!facts.emailVerified) {
    return {
      ...facts,
      fullBookUnlocked,
      canCreateTrial: false,
      creationExperience: null,
      reason: "verify_email",
    };
  }
  if (facts.hasPriorMeteredUsage) {
    return {
      ...facts,
      fullBookUnlocked,
      canCreateTrial: false,
      creationExperience: null,
      reason: "purchase_required",
    };
  }
  return {
    ...facts,
    fullBookUnlocked,
    canCreateTrial: true,
    creationExperience: "trial_short_story",
    reason: "trial_available",
  };
}

export function hasVerifiedEmail(
  addresses: Array<{ verification?: { status?: string | null } | null }>,
): boolean {
  return addresses.some((address) => address.verification?.status === "verified");
}

export function hasPriorAuthoringEvidence(input: {
  meteredUsage: boolean;
  generatedEvent: boolean;
  generatedOutline: boolean;
  generatedChapterRevision: boolean;
  generatedAsset: boolean;
}): boolean {
  return (
    input.meteredUsage ||
    input.generatedEvent ||
    input.generatedOutline ||
    input.generatedChapterRevision ||
    input.generatedAsset
  );
}

export function trialProjectHasCompletedProduction(
  input: { completionArtifactsReady: boolean } | null | undefined,
): boolean {
  return input?.completionArtifactsReady === true;
}

export function shouldOfferFullBookUnlock(
  access: Pick<StudioAccess, "fullBookUnlocked" | "trialProjectId" | "trialProjectCompleted">,
): boolean {
  return !access.fullBookUnlocked && access.trialProjectId !== null && access.trialProjectCompleted;
}

async function resolveVerifiedEmail(userId: string): Promise<boolean> {
  // The explicitly enabled local identity must exercise the same trial path
  // without needing Clerk network credentials.
  if (userId === "dev-user" || isE2ETrialUserId(userId)) return true;
  if (!clerkEnabled) return false;

  try {
    const user = await (await clerkClient()).users.getUser(userId);
    return hasVerifiedEmail(user.emailAddresses);
  } catch {
    // Trial claims fail closed when Clerk cannot confirm the address. Paid and
    // Admin access are derived from durable local records below.
    return false;
  }
}

/**
 * One authoritative entitlement snapshot for Studio creation.
 *
 * A purchase permanently unlocks full-book controls because the purchase row
 * remains even if a later refund changes wallet value. Real metered history
 * consumes the included experience; a failed zero-call workflow does not.
 */
export async function getStudioAccess(
  userId: string,
  options: { emailVerified?: boolean } = {},
): Promise<StudioAccess> {
  const db = getDb();
  const [
    [user],
    [purchase],
    [trial],
    [meteredUsage],
    [generatedEvent],
    [generatedOutline],
    [generatedChapterRevision],
    [generatedAsset],
  ] = await Promise.all([
    db
      .select({ role: schema.users.role, suspended: schema.users.suspended })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1),
    db
      .select({ id: schema.creditLedger.id })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.userId, userId),
          eq(schema.creditLedger.kind, "purchase"),
          gt(schema.creditLedger.amount, "0"),
        ),
      )
      .limit(1),
    db
      .select({
        id: schema.projects.id,
        completionArtifactsReady: validFullBookCompletionExistsSql(sql.raw('"projects"."id"')),
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.userId, userId),
          eq(schema.projects.experience, "trial_short_story"),
        ),
      )
      .limit(1),
    db
      .select({ id: schema.llmCalls.id })
      .from(schema.llmCalls)
      .where(eq(schema.llmCalls.userId, userId))
      .limit(1),
    db
      .select({ id: schema.generationEvents.id })
      .from(schema.generationEvents)
      .innerJoin(schema.generationRuns, eq(schema.generationRuns.id, schema.generationEvents.runId))
      .where(
        and(
          eq(schema.generationRuns.userId, userId),
          sql`(
            ${schema.generationEvents.type} in ('agent', 'chapter', 'review', 'tool_mutation')
            or (
              ${schema.generationEvents.type} = 'stage'
              and ${schema.generationEvents.payload}->>'stage' <> 'queued'
            )
          )`,
        ),
      )
      .limit(1),
    db
      .select({ id: schema.outlines.id })
      .from(schema.outlines)
      .innerJoin(schema.books, eq(schema.books.id, schema.outlines.bookId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .where(and(eq(schema.projects.userId, userId), eq(schema.outlines.source, "ai")))
      .limit(1),
    db
      .select({ id: schema.chapterRevisions.id })
      .from(schema.chapterRevisions)
      .innerJoin(schema.chapters, eq(schema.chapters.id, schema.chapterRevisions.chapterId))
      .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .where(and(eq(schema.projects.userId, userId), isNotNull(schema.chapterRevisions.runId)))
      .limit(1),
    db
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.assets.projectId))
      .where(
        and(
          eq(schema.projects.userId, userId),
          ne(schema.assets.kind, "export_epub"),
          ne(schema.assets.kind, "export_pdf"),
          ne(schema.assets.kind, "export_docx"),
          ne(schema.assets.kind, "export_md"),
        ),
      )
      .limit(1),
  ]);

  const isAdmin = user?.role === "admin";
  const hasSettledPurchase = Boolean(purchase);
  const hasPriorMeteredUsage = hasPriorAuthoringEvidence({
    meteredUsage: Boolean(meteredUsage),
    generatedEvent: Boolean(generatedEvent),
    generatedOutline: Boolean(generatedOutline),
    generatedChapterRevision: Boolean(generatedChapterRevision),
    generatedAsset: Boolean(generatedAsset),
  });
  const trialProjectId = trial?.id ?? null;
  // Require the run-owned finalization digest and complete chapter set.
  // Project status/completedAt remain compatibility data, not completion truth.
  const trialProjectCompleted = trialProjectHasCompletedProduction(trial);
  const emailVerified = options.emailVerified ?? (await resolveVerifiedEmail(userId));

  return deriveStudioAccess({
    emailVerified,
    isAdmin,
    suspended: user?.suspended === true,
    hasSettledPurchase,
    hasPriorMeteredUsage,
    trialProjectId,
    trialProjectCompleted,
  });
}

import { and, eq, inArray, sql } from "drizzle-orm";

import { schema, type DbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";
import { noActiveAuthoringRunSql } from "@/lib/generation-runs";
import { TRIAL_STORY_CONFIG } from "@/lib/trial-story";
import type { UpdateProjectInput } from "@/lib/validation/project";

type ProjectRow = typeof schema.projects.$inferSelect;

/**
 * The wizard may refresh a creation-key project after an infrastructure-only
 * start failure, but it must never rewrite the identity or production shape
 * observed by real authoring work.
 *
 * A queued-only event is still pre-authoring. Any non-terminal run, successful
 * run, authoring event, provider call, spend, or reservation freezes the
 * project. Keeping this as a statement predicate makes the decision atomic
 * with the UPDATE while the shared project-authoring lock is held.
 */
export function wizardInputsRemainMutableSql(projectId: string) {
  return sql<boolean>`not exists (
    select 1
    from ${schema.generationRuns}
    where ${schema.generationRuns.projectId} = ${projectId}
      and (
        ${schema.generationRuns.status} not in ('failed', 'cancelled')
        or exists (
          select 1
          from ${schema.generationEvents}
          where ${schema.generationEvents.runId} = ${schema.generationRuns.id}
            and (
              ${schema.generationEvents.type} in ('agent', 'chapter', 'review')
              or (
                ${schema.generationEvents.type} = 'stage'
                and ${schema.generationEvents.payload}->>'stage' <> 'queued'
              )
            )
        )
        or exists (
          select 1
          from ${schema.llmCalls}
          where ${schema.llmCalls.runId} = ${schema.generationRuns.id}
        )
        or exists (
          select 1
          from ${schema.creditLedger}
          where ${schema.creditLedger.runId} = ${schema.generationRuns.id}
            and (
              ${schema.creditLedger.kind} = 'usage'
              or coalesce(${schema.creditLedger.externalRef}, '')
                ~ '^(generation-reservation:|interactive-reservation:)'
            )
        )
      )
  )`;
}

export async function refreshProjectBeforeFirstRunTransaction(
  tx: DbTransaction,
  input: {
    project: ProjectRow;
    userId: string;
    values: Partial<typeof schema.projects.$inferInsert>;
  },
): Promise<ProjectRow> {
  await lockProjectAuthoring(tx, input.project.id);

  const [updated] = await tx
    .update(schema.projects)
    .set({ ...input.values, updatedAt: new Date() })
    .where(
      and(
        eq(schema.projects.id, input.project.id),
        eq(schema.projects.userId, input.userId),
        wizardInputsRemainMutableSql(input.project.id),
      ),
    )
    .returning();
  if (!updated) return input.project;

  await tx
    .update(schema.books)
    .set({ title: updated.title, updatedAt: new Date() })
    .where(eq(schema.books.projectId, updated.id));
  return updated;
}

export type UpdateProjectTransactionOutcome =
  "updated" | "not_found" | "trial_shape" | "active_run";

export async function updateProjectTransaction(
  tx: DbTransaction,
  input: {
    projectId: string;
    userId: string;
    data: UpdateProjectInput;
  },
): Promise<UpdateProjectTransactionOutcome> {
  await lockProjectAuthoring(tx, input.projectId);
  const [owned] = await tx
    .select({ id: schema.projects.id, experience: schema.projects.experience })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.userId, input.userId)))
    .limit(1);
  if (!owned) return "not_found";
  if (
    owned.experience === "trial_short_story" &&
    ((input.data.targetChapters !== undefined &&
      input.data.targetChapters !== TRIAL_STORY_CONFIG.targetChapters) ||
      (input.data.targetWordsPerChapter !== undefined &&
        input.data.targetWordsPerChapter !== TRIAL_STORY_CONFIG.targetWordsPerChapter) ||
      (input.data.settings?.qualityTier !== undefined &&
        input.data.settings.qualityTier !== TRIAL_STORY_CONFIG.tier) ||
      (input.data.settings?.requireOutlineApproval !== undefined &&
        input.data.settings.requireOutlineApproval !== TRIAL_STORY_CONFIG.requireOutlineApproval))
  ) {
    return "trial_shape";
  }

  const [updated] = await tx
    .update(schema.projects)
    .set({ ...input.data, updatedAt: new Date() })
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.userId, input.userId),
        noActiveAuthoringRunSql(input.projectId),
      ),
    )
    .returning({ id: schema.projects.id });
  if (!updated) return "active_run";

  if (input.data.title !== undefined) {
    await tx
      .update(schema.books)
      .set({ title: input.data.title, updatedAt: new Date() })
      .where(eq(schema.books.projectId, input.projectId));
  }
  return "updated";
}

export type DeleteProjectTransactionOutcome =
  "deleted" | "not_found" | "active_run" | "open_billing";

export async function deleteProjectTransaction(
  tx: DbTransaction,
  input: {
    projectId: string;
    userId: string;
    scheduleCleanup: (projectId: string, pathnames: string[]) => Promise<void>;
  },
): Promise<DeleteProjectTransactionOutcome> {
  await lockProjectAuthoring(tx, input.projectId);
  const [owned] = await tx
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.userId, input.userId)))
    .limit(1);
  if (!owned) return "not_found";

  // Metering intents use this wallet lock. Taking it after the project lock
  // closes the gap between the open-protocol snapshot and cascade delete.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`);

  const [activeRun] = await tx
    .select({ id: schema.generationRuns.id })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, input.projectId),
        eq(schema.generationRuns.userId, input.userId),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
      ),
    )
    .limit(1);
  if (activeRun) return "active_run";

  const [openBillingProtocol] = await tx
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, input.userId),
        eq(schema.creditLedger.projectId, input.projectId),
        sql`(
          (
            (
              ${schema.creditLedger.externalRef} like 'generation-reservation:%'
              or ${schema.creditLedger.externalRef} like 'interactive-reservation:%'
            )
            and ${schema.creditLedger.amount} < 0
            and not exists (
              select 1 from credit_ledger released
              where released.external_ref =
                'release:' || ${schema.creditLedger.externalRef}
            )
          )
          or (
            ${schema.creditLedger.externalRef} like 'metering-intent:%'
            and ${schema.creditLedger.amount} = 0
            and not exists (
              select 1 from credit_ledger terminal
              where terminal.external_ref in (
                'intent-settled:' || ${schema.creditLedger.externalRef},
                'intent-aborted:' || ${schema.creditLedger.externalRef}
              )
            )
          )
        )`,
      ),
    )
    .limit(1);
  if (openBillingProtocol) return "open_billing";

  const assetRows = await tx
    .select({ pathname: schema.assets.blobPathname })
    .from(schema.assets)
    .where(eq(schema.assets.projectId, input.projectId));
  const pathnames = [...new Set(assetRows.map((asset) => asset.pathname).filter(Boolean))];
  if (pathnames.length > 0) {
    await input.scheduleCleanup(input.projectId, pathnames);
  }

  const [deleted] = await tx
    .delete(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.userId, input.userId),
        noActiveAuthoringRunSql(input.projectId),
      ),
    )
    .returning({ id: schema.projects.id });
  return deleted ? "deleted" : "active_run";
}

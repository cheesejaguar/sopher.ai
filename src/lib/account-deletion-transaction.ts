import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { schema, type DbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";

export type AccountDeletionCleanup = {
  projectId: string;
  pathnames: string[];
};

export type AccountDeletionOutcome = "deleted" | "already_deleted" | "active_run" | "open_billing";

export async function deleteClerkUserTransaction(
  tx: DbTransaction,
  input: {
    userId: string;
    scheduleCleanup: (projects: AccountDeletionCleanup[]) => Promise<void>;
  },
): Promise<AccountDeletionOutcome> {
  // PostgreSQL foreign-key inserts need a conflicting key-share lock, so once
  // this returns no new project can appear outside the cleanup snapshot.
  const [lockedUser] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, input.userId))
    .for("update")
    .limit(1);
  if (!lockedUser) return "already_deleted";

  const projectRows = await tx
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.userId, input.userId))
    .orderBy(asc(schema.projects.id));

  // Match the established project -> wallet lock order. Sorting makes
  // duplicate webhook deliveries and administrative cleanup deadlock-safe.
  for (const project of projectRows) {
    await lockProjectAuthoring(tx, project.id);
  }
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`);

  const [activeRun] = await tx
    .select({ id: schema.generationRuns.id })
    .from(schema.generationRuns)
    .where(
      and(
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

  const projectIds = projectRows.map((project) => project.id);
  const assetRows =
    projectIds.length === 0
      ? []
      : await tx
          .select({
            projectId: schema.assets.projectId,
            pathname: schema.assets.blobPathname,
          })
          .from(schema.assets)
          .where(inArray(schema.assets.projectId, projectIds));
  const byProject = new Map<string, Set<string>>();
  for (const asset of assetRows) {
    if (!asset.pathname) continue;
    const pathnames = byProject.get(asset.projectId) ?? new Set<string>();
    pathnames.add(asset.pathname);
    byProject.set(asset.projectId, pathnames);
  }
  const cleanupInput = [...byProject.entries()].map(([projectId, pathnames]) => ({
    projectId,
    pathnames: [...pathnames],
  }));
  if (cleanupInput.length > 0) {
    await input.scheduleCleanup(cleanupInput);
  }

  const [deleted] = await tx
    .delete(schema.users)
    .where(eq(schema.users.id, input.userId))
    .returning({ id: schema.users.id });
  if (!deleted) throw new Error("User disappeared during account deletion");
  return "deleted";
}

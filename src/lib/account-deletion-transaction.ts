import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { schema, type DbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";
import {
  repairDeliveredOptionalOperationLeases,
  unreleasedBillingProtocolSql,
} from "@/lib/project-transaction-operations";

export type AccountDeletionCleanup = {
  projectId: string;
  pathnames: string[];
};

export type AccountDeletionOutcome =
  "deleted" | "already_deleted" | "retry" | "active_run" | "open_billing";

export async function deleteClerkUserTransaction(
  tx: DbTransaction,
  input: {
    userId: string;
    scheduleCleanup: (projects: AccountDeletionCleanup[]) => Promise<void>;
  },
): Promise<AccountDeletionOutcome> {
  const [existingUser] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, input.userId))
    .limit(1);
  if (!existingUser) return "already_deleted";

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

  // Optional metering takes project -> wallet -> user-row locks. Follow the same order
  // so deleting a Clerk identity cannot deadlock an in-flight optional tool.
  // The row lock then freezes foreign-key project inserts; if one committed
  // while the project lock snapshot was being acquired, retry from a fresh
  // ordered snapshot instead of locking the new project in reverse order.
  const [lockedUser] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, input.userId))
    .for("update")
    .limit(1);
  if (!lockedUser) return "already_deleted";
  const confirmedProjects = await tx
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.userId, input.userId))
    .orderBy(asc(schema.projects.id));
  if (
    confirmedProjects.length !== projectRows.length ||
    confirmedProjects.some((project, index) => project.id !== projectRows[index]?.id)
  ) {
    return "retry";
  }

  await repairDeliveredOptionalOperationLeases(tx, { userId: input.userId });

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
    .where(unreleasedBillingProtocolSql({ userId: input.userId }))
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

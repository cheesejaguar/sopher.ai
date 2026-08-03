import { sleep } from "workflow";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { sendOutlineApprovalEmail } from "@/lib/email/send";

async function sendOutlineReminderIfStillWaiting(
  runId: string,
  projectId: string,
  pauseVersion: number,
): Promise<void> {
  "use step";
  const [row] = await getDb()
    .select({
      status: schema.generationRuns.status,
      pauseKind: schema.generationRuns.pauseKind,
      pauseVersion: schema.generationRuns.pauseVersion,
      email: schema.users.email,
      title: schema.projects.title,
    })
    .from(schema.generationRuns)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.generationRuns.projectId))
    .innerJoin(schema.users, eq(schema.users.id, schema.generationRuns.userId))
    .where(and(eq(schema.generationRuns.id, runId), eq(schema.generationRuns.projectId, projectId)))
    .limit(1);
  if (
    !row ||
    row.status !== "awaiting_input" ||
    row.pauseKind !== "outline_approval" ||
    row.pauseVersion !== pauseVersion
  ) {
    return;
  }
  await sendOutlineApprovalEmail({
    to: row.email,
    bookTitle: row.title,
    projectId,
    runId,
    pauseVersion,
    reminder: true,
  });
}

export async function outlineApprovalReminder(
  runId: string,
  projectId: string,
  pauseVersion: number,
): Promise<void> {
  "use workflow";
  await sleep("24 hours");
  await sendOutlineReminderIfStillWaiting(runId, projectId, pauseVersion);
}

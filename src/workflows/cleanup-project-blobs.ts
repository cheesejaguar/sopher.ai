import { del } from "@vercel/blob";
import { sleep } from "workflow";

import { withDbTransaction } from "@/db";
import { projectExistsUnderAuthoringLock } from "@/db/transaction-operations";

const PROJECT_DELETE_COMMIT_GRACE = "1 minute";

export type ProjectBlobCleanup = {
  projectId: string;
  pathnames: string[];
};

export async function deleteProjectBlobsIfCommittedStep(
  projectId: string,
  pathnames: string[],
): Promise<void> {
  "use step";
  const projectExists = await withDbTransaction((tx) =>
    projectExistsUnderAuthoringLock(tx, projectId),
  );
  if (projectExists || pathnames.length === 0) return;
  // Vercel Workflow retries a failed step, while the pathnames remain durable
  // workflow input even though their asset rows were cascade-deleted.
  await del(pathnames);
}

/**
 * Scheduled before the project-delete transaction commits. The delayed
 * existence check makes both outcomes safe: rollback keeps Blobs; commit
 * durably removes every stored asset kind with retryable workflow state.
 */
export async function cleanupProjectBlobsAfterDelete(
  projectId: string,
  pathnames: string[],
): Promise<void> {
  "use workflow";
  await sleep(PROJECT_DELETE_COMMIT_GRACE);
  await deleteProjectBlobsIfCommittedStep(projectId, pathnames);
}

/**
 * One durable workflow owns every Blob pathname captured before an account
 * cascade. Starting one workflow keeps the webhook bounded even for authors
 * with many projects, while each project retains its own advisory-lock check.
 */
export async function cleanupUserProjectBlobsAfterDelete(
  projects: ProjectBlobCleanup[],
): Promise<void> {
  "use workflow";
  await sleep(PROJECT_DELETE_COMMIT_GRACE);
  for (const project of projects) {
    await deleteProjectBlobsIfCommittedStep(project.projectId, project.pathnames);
  }
}

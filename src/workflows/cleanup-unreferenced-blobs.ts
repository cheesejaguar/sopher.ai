import { del } from "@vercel/blob";
import { sleep } from "workflow";

import { withDbTransaction } from "@/db";
import { referencedAssetPathnamesUnderAuthoringLock } from "@/db/transaction-operations";

// Every route that uses this workflow has maxDuration <= 120 seconds. Waiting
// longer prevents cleanup from racing a slow database commit acknowledgement.
const PERSISTENCE_GRACE = "5 minutes";

export async function deleteUnreferencedBlobsStep(
  projectId: string,
  pathnames: string[],
): Promise<void> {
  "use step";
  const uniquePathnames = [...new Set(pathnames.filter(Boolean))];
  if (uniquePathnames.length === 0) return;

  // Asset persistence and project deletion use this same lock. The delayed
  // cleanup therefore observes the committed side of either operation.
  const referenced = await withDbTransaction((tx) =>
    referencedAssetPathnamesUnderAuthoringLock(tx, projectId, uniquePathnames),
  );
  const referencedPathnames = new Set(referenced);
  const unreferenced = uniquePathnames.filter((pathname) => !referencedPathnames.has(pathname));
  if (unreferenced.length > 0) await del(unreferenced);
}

export async function cleanupUnreferencedBlobs(
  projectId: string,
  pathnames: string[],
): Promise<void> {
  "use workflow";
  await sleep(PERSISTENCE_GRACE);
  await deleteUnreferencedBlobsStep(projectId, pathnames);
}

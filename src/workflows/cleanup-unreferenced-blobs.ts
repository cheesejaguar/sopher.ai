import { del } from "@vercel/blob";
import { inArray, sql } from "drizzle-orm";
import { sleep } from "workflow";

import { getDb, schema } from "@/db";

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

  const db = getDb();
  const referenced = await db.transaction(async (tx) => {
    // Asset persistence and project deletion use this same lock. The delayed
    // cleanup therefore observes the committed side of either operation.
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${projectId}, 0)
      )`,
    );
    return tx
      .select({ pathname: schema.assets.blobPathname })
      .from(schema.assets)
      .where(inArray(schema.assets.blobPathname, uniquePathnames));
  });
  const referencedPathnames = new Set(referenced.map((row) => row.pathname));
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

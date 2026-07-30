import { del } from "@vercel/blob";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/db";

async function removeReplacedAssetStep(
  projectId: string,
  assetId: string,
  pathname: string,
): Promise<void> {
  "use step";
  await getDb()
    .delete(schema.assets)
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.projectId, projectId)));
  // The pathname remains durable workflow input if Blob deletion needs retry
  // after the asset row is already gone.
  await del(pathname);
}

export async function cleanupReplacedAsset(
  projectId: string,
  assetId: string,
  pathname: string,
): Promise<void> {
  "use workflow";
  await removeReplacedAssetStep(projectId, assetId, pathname);
}

import { del } from "@vercel/blob";
import { and, eq, sql } from "drizzle-orm";

import { schema, withDbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";

async function removeReplacedAssetStep(
  projectId: string,
  assetId: string,
  pathname: string,
): Promise<void> {
  "use step";
  const removedPathname = await withDbTransaction(async (tx) => {
    await lockProjectAuthoring(tx, projectId);
    const [asset] = await tx
      .select({ blobUrl: schema.assets.blobUrl, blobPathname: schema.assets.blobPathname })
      .from(schema.assets)
      .where(and(eq(schema.assets.id, assetId), eq(schema.assets.projectId, projectId)))
      .limit(1);

    // A shared edition is immutable. Keep the exact Blob object until every
    // retained edition that captured it has been garbage-collected.
    if (asset) {
      const [editionReference] = await tx
        .select({ id: schema.publicationEditions.id })
        .from(schema.publicationEditions)
        .where(
          and(
            eq(schema.publicationEditions.projectId, projectId),
            sql`${schema.publicationEditions.snapshot}->'assetUrls' ? ${asset.blobUrl}`,
          ),
        )
        .limit(1);
      if (editionReference) return null;

      await tx
        .delete(schema.assets)
        .where(and(eq(schema.assets.id, assetId), eq(schema.assets.projectId, projectId)));
      return asset.blobPathname;
    }

    // A prior step attempt may have committed the row deletion before Blob
    // deletion failed. The durable pathname remains safe to retry.
    return pathname;
  });
  if (!removedPathname) return;
  // The pathname remains durable workflow input if Blob deletion needs retry
  // after the asset row is already gone.
  await del(removedPathname);
}

export async function cleanupReplacedAsset(
  projectId: string,
  assetId: string,
  pathname: string,
): Promise<void> {
  "use workflow";
  await removeReplacedAssetStep(projectId, assetId, pathname);
}

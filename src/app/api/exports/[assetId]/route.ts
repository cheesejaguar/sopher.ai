import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

const paramsSchema = z.object({ assetId: z.uuid() });

/**
 * Ownership-checked download: proxies the blob bytes instead of redirecting,
 * so the raw blob URL never reaches the browser (history, referrers, UI).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ assetId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }
  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success) {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }

  const db = getDb();
  const [asset] = await db
    .select({
      blobUrl: schema.assets.blobUrl,
      contentType: schema.assets.contentType,
      meta: schema.assets.meta,
    })
    .from(schema.assets)
    .innerJoin(schema.projects, eq(schema.assets.projectId, schema.projects.id))
    .where(and(eq(schema.assets.id, parsed.data.assetId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!asset) return Response.json({ error: "Asset not found" }, { status: 404 });

  const meta = asset.meta as { filename?: string };
  const res = await fetch(asset.blobUrl);
  if (!res.ok || !res.body) {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }
  return new Response(res.body, {
    headers: {
      "Content-Type": asset.contentType,
      "Content-Disposition": `attachment; filename="${meta.filename ?? "book"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

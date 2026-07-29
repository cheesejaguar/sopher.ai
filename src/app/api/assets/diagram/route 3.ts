import { put } from "@vercel/blob";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { getChapterOwnership } from "@/db/queries/books";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { diagramSourceHash } from "@/lib/export/figures";

/**
 * Caches a client-rendered Mermaid diagram so server-side surfaces (reading
 * view, EPUB, PDF, DOCX) can show the diagram instead of its source. Mermaid
 * needs a DOM, so the editor renders it and posts the result here.
 *
 * Idempotent: keyed by a hash of the diagram source, so re-opening a chapter
 * re-posts the same payload and no-ops. Costs one round trip, no LLM call.
 */

export const maxDuration = 60;

const MAX_SVG_CHARS = 512_000;
const MAX_PNG_BYTES = 4_000_000;

const bodySchema = z.object({
  chapterId: z.uuid(),
  source: z.string().min(1).max(20_000),
  svg: z.string().min(1).max(MAX_SVG_CHARS),
  /** PNG rasterization as a bare base64 payload (no data: prefix). */
  pngBase64: z.string().min(1).max(MAX_PNG_BYTES),
  alt: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { chapterId, source, svg, pngBase64, alt } = parsed.data;

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  const sourceHash = diagramSourceHash(source);
  const db = getDb();

  // Already cached for this project — nothing to do.
  const existing = await db
    .select({ id: schema.assets.id })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.projectId, ownership.projectId),
        eq(schema.assets.kind, "diagram"),
        sql`${schema.assets.meta}->>'sourceHash' = ${sourceHash}`,
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return Response.json({ cached: true, sourceHash });
  }

  const png = Buffer.from(pngBase64, "base64");
  if (png.length === 0) {
    return Response.json({ error: "Invalid PNG payload" }, { status: 400 });
  }

  const meta = { sourceHash, alt: alt || "Diagram" };
  const base = `diagrams/${ownership.projectId}/${sourceHash}`;

  const [svgBlob, pngBlob] = await Promise.all([
    put(`${base}.svg`, svg, {
      access: "public",
      contentType: "image/svg+xml",
      addRandomSuffix: false,
    }),
    put(`${base}.png`, png, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
    }),
  ]);

  await db.insert(schema.assets).values([
    {
      projectId: ownership.projectId,
      chapterId,
      kind: "diagram" as const,
      blobUrl: svgBlob.url,
      blobPathname: svgBlob.pathname,
      contentType: "image/svg+xml",
      sizeBytes: Buffer.byteLength(svg),
      meta,
    },
    {
      projectId: ownership.projectId,
      chapterId,
      kind: "diagram" as const,
      blobUrl: pngBlob.url,
      blobPathname: pngBlob.pathname,
      contentType: "image/png",
      sizeBytes: png.length,
      meta,
    },
  ]);

  return Response.json({ cached: false, sourceHash });
}

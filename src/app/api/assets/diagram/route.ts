import { put } from "@vercel/blob";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema, withDbTransaction } from "@/db";
import { persistDiagramAssetsTransaction } from "@/db/transaction-operations";
import { getChapterOwnership } from "@/db/queries/books";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { resolveBlobUploads } from "@/lib/blob/lifecycle";
import {
  compensateUnreferencedBlobUpload,
  scheduleUnreferencedBlobCleanup,
} from "@/lib/blob/orphan-cleanup";
import { diagramSourceHash } from "@/lib/export/figures";
import { sanitizeSvg } from "@/lib/security/svg";

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
    .select({ contentType: schema.assets.contentType })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.projectId, ownership.projectId),
        eq(schema.assets.kind, "diagram"),
        sql`${schema.assets.meta}->>'sourceHash' = ${sourceHash}`,
      ),
    )
    .limit(2);
  if (
    existing.some((asset) => asset.contentType === "image/svg+xml") &&
    existing.some((asset) => asset.contentType === "image/png")
  ) {
    return Response.json({ cached: true, sourceHash });
  }

  const png = Buffer.from(pngBase64, "base64");
  if (png.length === 0) {
    return Response.json({ error: "Invalid PNG payload" }, { status: 400 });
  }

  // The server can't render Mermaid, so it can't verify this SVG matches the
  // source it claims — it only knows the caller owns the chapter. Sanitize
  // before it reaches a public blob URL.
  const safeSvg = sanitizeSvg(svg);
  if (!safeSvg) {
    return Response.json({ error: "Invalid SVG payload" }, { status: 400 });
  }

  const meta = { sourceHash, alt: alt || "Diagram" };
  // A per-request token keeps one failed concurrent cache attempt from
  // deleting another request's successful deterministic pathname.
  const base = `diagrams/${ownership.projectId}/${sourceHash}-${crypto.randomUUID()}`;

  const [svgBlob, pngBlob] = await resolveBlobUploads(
    [
      put(`${base}.svg`, safeSvg, {
        access: "public",
        contentType: "image/svg+xml",
        addRandomSuffix: false,
      }),
      put(`${base}.png`, png, {
        access: "public",
        contentType: "image/png",
        addRandomSuffix: false,
      }),
    ],
    "diagram",
    (pathnames) => compensateUnreferencedBlobUpload({ projectId: ownership.projectId, pathnames }),
  );

  try {
    // Schedule before persistence. A delayed workflow keeps referenced files
    // and durably retries deletion if this request never commits asset rows.
    await scheduleUnreferencedBlobCleanup({
      projectId: ownership.projectId,
      pathnames: [svgBlob.pathname, pngBlob.pathname],
    });
  } catch (error) {
    try {
      await compensateUnreferencedBlobUpload({
        projectId: ownership.projectId,
        pathnames: [svgBlob.pathname, pngBlob.pathname],
      });
    } catch (cleanupError) {
      throw new AggregateError(
        [
          error instanceof Error ? error : new Error(String(error)),
          cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)),
        ],
        "Diagram cleanup could not be made durable",
      );
    }
    throw error;
  }

  try {
    await withDbTransaction((tx) =>
      persistDiagramAssetsTransaction(tx, {
        projectId: ownership.projectId,
        chapterId,
        sourceHash,
        alt: meta.alt,
        svg: {
          url: svgBlob.url,
          pathname: svgBlob.pathname,
          sizeBytes: Buffer.byteLength(safeSvg),
        },
        png: {
          url: pngBlob.url,
          pathname: pngBlob.pathname,
          sizeBytes: png.length,
        },
      }),
    );
  } catch (error) {
    // A rejected COMMIT acknowledgement is ambiguous. Verify the exact rows;
    // deleting first could break a successfully committed diagram.
    let committed;
    try {
      committed = await db
        .select({ pathname: schema.assets.blobPathname })
        .from(schema.assets)
        .where(
          and(
            eq(schema.assets.projectId, ownership.projectId),
            inArray(schema.assets.blobPathname, [svgBlob.pathname, pngBlob.pathname]),
          ),
        );
    } catch (verificationError) {
      throw new AggregateError(
        [
          error instanceof Error ? error : new Error(String(error)),
          verificationError instanceof Error
            ? verificationError
            : new Error(String(verificationError)),
        ],
        "Diagram persistence failed and could not be verified",
      );
    }
    const committedPathnames = new Set(committed.map((asset) => asset.pathname));
    if (committedPathnames.has(svgBlob.pathname) && committedPathnames.has(pngBlob.pathname)) {
      return Response.json({ cached: false, sourceHash });
    }
    // The pre-scheduled workflow owns cleanup of every unreferenced pathname.
    throw error;
  }

  return Response.json({ cached: false, sourceHash });
}

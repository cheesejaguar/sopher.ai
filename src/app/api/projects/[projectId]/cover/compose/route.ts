import { put } from "@vercel/blob";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema, withDbTransaction } from "@/db";
import { replaceCoverAssetTransaction } from "@/db/transaction-operations";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { scheduleReplacedAssetCleanup } from "@/lib/blob-cleanup";
import {
  compensateUnreferencedBlobUpload,
  scheduleUnreferencedBlobCleanup,
} from "@/lib/blob/orphan-cleanup";
import { readBookMatter } from "@/lib/book-package";
import {
  COVER_ART_ASSET_KIND,
  COVER_ART_ROLE,
  COVER_LAYOUT_IDS,
  COVER_PALETTE_IDS,
  CoverCompositionError,
  DEFAULT_COVER_PALETTE,
  renderTitledCover,
  type CoverLayoutId,
  type CoverPaletteId,
} from "@/lib/cover";
import { isOwnedReaderAssetUrl } from "@/lib/publication-editions";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";

/**
 * Re-letters an existing cover. Free, and deliberately not on the paid path:
 * the painting is already bought and stored as its own asset, so changing the
 * arrangement of the title is pure local work — no model call, no idempotency
 * key, no spend authorization, nothing to refund.
 */

export const maxDuration = 60;

/** Well beyond any image the generator produces; a guard, not a budget. */
const MAX_ART_BYTES = 25_000_000;

const bodySchema = z.object({
  layout: z.enum(COVER_LAYOUT_IDS),
  palette: z.enum(COVER_PALETTE_IDS).optional(),
});

const projectIdSchema = z.uuid();

type CoverArtSource = {
  url: string;
  contentType: string;
  /** Set only when the art already has an asset row of its own. */
  assetId?: string;
};

async function loadBook(projectId: string, userId: string) {
  const [row] = await getDb()
    .select({
      bookId: schema.books.id,
      title: schema.books.title,
      frontMatter: schema.books.frontMatter,
    })
    .from(schema.books)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function loadCoverArt(
  projectId: string,
  /** The cover the book currently points at, so stale art is not preferred over it. */
  coverUrl: string | null,
): Promise<{
  source: CoverArtSource;
  layout: CoverLayoutId | null;
  palette: CoverPaletteId | null;
} | null> {
  const [art] = await getDb()
    .select({
      id: schema.assets.id,
      url: schema.assets.blobUrl,
      contentType: schema.assets.contentType,
      meta: schema.assets.meta,
      createdAt: schema.assets.createdAt,
    })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.projectId, projectId),
        eq(schema.assets.kind, COVER_ART_ASSET_KIND),
        sql`${schema.assets.meta}->>'role' = ${COVER_ART_ROLE}`,
      ),
    )
    .orderBy(desc(schema.assets.createdAt))
    .limit(1);
  if (!art) return null;

  // A paid regeneration whose lettering step fails stores the raw painting as
  // the cover and records no cover-art row for it. The newest art row is then
  // the *previous* painting, and re-lettering it would silently discard the one
  // the author just paid for. If the live cover is newer than this art, the
  // cover is itself the painting — letter that instead.
  if (coverUrl) {
    const [cover] = await getDb()
      .select({ createdAt: schema.assets.createdAt })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.projectId, projectId),
          eq(schema.assets.kind, "cover"),
          eq(schema.assets.blobUrl, coverUrl),
        ),
      )
      .limit(1);
    if (cover && cover.createdAt > art.createdAt) return null;
  }

  const meta = art.meta as Record<string, unknown>;
  const layout = COVER_LAYOUT_IDS.find((id) => id === meta.layout) ?? null;
  const palette = COVER_PALETTE_IDS.find((id) => id === meta.palette) ?? null;
  return {
    source: { url: art.url, contentType: art.contentType, assetId: art.id },
    layout,
    palette,
  };
}

/**
 * Covers made before lettering existed are unlettered paintings themselves, so
 * the current cover doubles as its own art — but only as a copy. The original
 * object is about to be displaced and collected, and the art must outlive it.
 */
async function loadLegacyArt(
  projectId: string,
  coverUrl: string | null,
): Promise<CoverArtSource | null> {
  if (!coverUrl) return null;
  const [cover] = await getDb()
    .select({ url: schema.assets.blobUrl, contentType: schema.assets.contentType })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.projectId, projectId),
        eq(schema.assets.kind, "cover"),
        eq(schema.assets.blobUrl, coverUrl),
      ),
    )
    .limit(1);
  return cover ? { url: cover.url, contentType: cover.contentType } : null;
}

async function fetchArt(url: string): Promise<Uint8Array> {
  // The URL comes from our own asset row; the check keeps a corrupted or
  // hand-edited row from turning this route into a fetcher for anything else.
  if (!isOwnedReaderAssetUrl(url)) throw new CoverCompositionError("The cover art is unreadable");
  const response = await fetch(url);
  if (!response.ok) throw new CoverCompositionError("The cover art could not be read");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ART_BYTES) {
    throw new CoverCompositionError("The cover art could not be read");
  }
  return bytes;
}

export async function GET(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }

  const projectId = projectIdSchema.safeParse((await ctx.params).projectId);
  if (!projectId.success) return Response.json({ error: "Book not found" }, { status: 404 });

  const book = await loadBook(projectId.data, userId);
  if (!book) return Response.json({ error: "Book not found" }, { status: 404 });

  const matter = readBookMatter(book.frontMatter);
  const art = await loadCoverArt(projectId.data, matter.coverUrl ?? null);
  return Response.json({
    hasCover: Boolean(matter.coverUrl),
    canCompose: Boolean(art ?? matter.coverUrl),
    layout: art?.layout ?? null,
    palette: art?.palette ?? null,
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }

  // Free, but it still rasterises an image and writes to Blob on every call.
  const limited = await rateLimit(LIMITS.coverCompose, req, userId);
  if (limited.limited) return limited.response;

  const projectId = projectIdSchema.safeParse((await ctx.params).projectId);
  if (!projectId.success) return Response.json({ error: "Book not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const layout = parsed.data.layout;
  const palette = parsed.data.palette ?? DEFAULT_COVER_PALETTE;

  const book = await loadBook(projectId.data, userId);
  if (!book) return Response.json({ error: "Book not found" }, { status: 404 });

  const matter = readBookMatter(book.frontMatter);
  const stored = await loadCoverArt(projectId.data, matter.coverUrl ?? null);
  const source = stored?.source ?? (await loadLegacyArt(projectId.data, matter.coverUrl ?? null));
  if (!source) {
    return Response.json(
      { error: "Generate a cover before changing its lettering", code: "no_cover" },
      { status: 409 },
    );
  }

  let art: Uint8Array;
  let lettered: Awaited<ReturnType<typeof renderTitledCover>>;
  try {
    art = await fetchArt(source.url);
    lettered = await renderTitledCover({
      art,
      artContentType: source.contentType,
      title: book.title,
      subtitle: matter.subtitle ?? null,
      author: matter.author ?? null,
      layout,
      palette,
    });
  } catch (error) {
    if (error instanceof CoverCompositionError) {
      console.error("Could not re-letter a cover", { projectId: projectId.data, error });
      return Response.json({ error: "Could not render the lettering" }, { status: 502 });
    }
    throw error;
  }

  const id = crypto.randomUUID();
  const uploads: Array<{ url: string; pathname: string }> = [];
  let coverBlob: Awaited<ReturnType<typeof put>>;
  let artBlob: Awaited<ReturnType<typeof put>> | null = null;
  try {
    coverBlob = await put(`covers/${projectId.data}/${id}.png`, Buffer.from(lettered.bytes), {
      access: "public",
      contentType: "image/png",
    });
    uploads.push(coverBlob);
    if (!source.assetId) {
      artBlob = await put(`covers/${projectId.data}/${id}-art.png`, Buffer.from(art), {
        access: "public",
        contentType: source.contentType,
      });
      uploads.push(artBlob);
    }
  } catch {
    if (uploads.length > 0) {
      await compensateUnreferencedBlobUpload({
        projectId: projectId.data,
        pathnames: uploads.map((upload) => upload.pathname),
      });
    }
    return Response.json({ error: "Could not store the cover" }, { status: 502 });
  }

  // Same order as the paid route: make cleanup durable before the write that
  // would make these objects durable, so a crash in between leaks nothing.
  try {
    await scheduleUnreferencedBlobCleanup({
      projectId: projectId.data,
      pathnames: uploads.map((upload) => upload.pathname),
    });
  } catch {
    await compensateUnreferencedBlobUpload({
      projectId: projectId.data,
      pathnames: uploads.map((upload) => upload.pathname),
    });
    return Response.json({ error: "Could not store the cover" }, { status: 502 });
  }

  let displaced: { id: string; pathname: string } | undefined;
  try {
    await withDbTransaction(async (tx) => {
      displaced = await replaceCoverAssetTransaction(tx, {
        projectId: projectId.data,
        bookId: book.bookId,
        title: book.title,
        // Prefixed, never a bare UUID: the paid route treats a matching
        // `operationKey` on a cover asset as evidence of a paid replay.
        operationKey: `letter:${id}`,
        url: coverBlob.url,
        pathname: coverBlob.pathname,
        contentType: "image/png",
        sizeBytes: lettered.bytes.byteLength,
      });
      if (artBlob) {
        await tx.insert(schema.assets).values({
          projectId: projectId.data,
          kind: COVER_ART_ASSET_KIND,
          blobUrl: artBlob.url,
          blobPathname: artBlob.pathname,
          contentType: source.contentType,
          sizeBytes: art.byteLength,
          meta: { role: COVER_ART_ROLE, layout, palette },
        });
      } else if (source.assetId) {
        await tx
          .update(schema.assets)
          .set({ meta: { role: COVER_ART_ROLE, layout, palette } })
          .where(
            and(
              eq(schema.assets.id, source.assetId),
              eq(schema.assets.projectId, projectId.data),
              eq(schema.assets.kind, COVER_ART_ASSET_KIND),
            ),
          );
      }
    });
  } catch (error) {
    console.error("Could not persist a re-lettered cover", { projectId: projectId.data, error });
    return Response.json({ error: "Could not store the cover" }, { status: 502 });
  }

  await scheduleReplacedAssetCleanup({
    projectId: projectId.data,
    assetId: displaced?.id,
    pathname: displaced?.pathname,
  });
  return Response.json({ url: coverBlob.url, layout, palette });
}

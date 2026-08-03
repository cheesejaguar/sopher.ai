import { put } from "@vercel/blob";
import { generateText } from "ai";
import { and, desc, eq, sql } from "drizzle-orm";

import {
  gatewayOptions,
  healReplayedMeteredDelivery,
  metered,
  MeteredDeliveryPendingError,
  MeteredDeliveryReplayError,
  meteredCallAuthorizationUsd,
  completeMeteredDelivery,
  refundMeteredDelivery,
  type MeterCtx,
} from "@/ai/metering";
import { meteredInputGuard, meteredMaxOutputTokens } from "@/ai/metering-limits";
import { MODELS, type QualityTier } from "@/ai/models";
import { getDb, schema, withDbTransaction } from "@/db";
import {
  COVER_DELIVERY_TOOL_ID,
  persistCoverDeliveryTransaction,
  promoteContentToolDeliveryReceiptTransaction,
  promoteLegacyImageDeliveryTransaction,
} from "@/db/transaction-operations";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { assertCreditsForUsd, InsufficientCreditsError } from "@/lib/billing/credits";
import { MODEL_PRICING } from "@/lib/billing/pricing";
import { InvalidIdempotencyKeyError, requireIdempotencyKey } from "@/lib/billing/idempotency";
import { scheduleReplacedAssetCleanup } from "@/lib/blob-cleanup";
import {
  compensateUnreferencedBlobUpload,
  scheduleUnreferencedBlobCleanup,
} from "@/lib/blob/orphan-cleanup";
import { authorizeProjectSpend, projectSpendAccessErrorResponse } from "@/lib/project-spend-http";
import { optionalDeliveryReceiptRef } from "@/lib/billing/optional-delivery";
import { readBookMatter } from "@/lib/book-package";
import {
  COVER_ART_ASSET_KIND,
  COVER_ART_ROLE,
  DEFAULT_COVER_LAYOUT,
  DEFAULT_COVER_PALETTE,
  renderTitledCover,
  type TitledCover,
} from "@/lib/cover";
import { resolveBlobUploads } from "@/lib/blob/lifecycle";

/**
 * Generates a book cover from the book's own identity — title, synopsis,
 * genre — and stores it as the project's cover asset. On demand only, priced
 * like every other image call, metered into llm_calls.
 *
 * Two objects come out of one paid call: the painting, kept as its own asset,
 * and the finished cover with the title set on it. Only the second is the
 * `cover` asset every consumer reads; the first exists so the author can
 * re-letter for free afterwards (`./compose`).
 */

export const maxDuration = 120;

const COVER_USD = MODEL_PRICING["google/gemini-3.1-flash-image"]?.perImageUsd ?? 0.067;

function coverPrompt(input: { title: string; synopsis: string | null; genre: string | null }) {
  return [
    `Book cover illustration for "${input.title}".`,
    input.genre ? `Genre: ${input.genre}.` : "",
    input.synopsis ? `The story: ${input.synopsis}` : "",
    `Portrait orientation, strong single focal image, atmospheric literary illustration,`,
    `painterly, muted palette. Leave the top third quiet and uncluttered —`,
    `the title is set there afterwards, so nothing important belongs in it.`,
    `No text, no lettering, no watermark, no borders.`,
  ]
    .filter(Boolean)
    .join(" ");
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

  try {
    await assertNotSuspended(userId);
  } catch (error) {
    if (error instanceof SuspendedError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  // Bound repeated paid-work requests before atomic provider authorization.
  const limited = await rateLimit(LIMITS.imageGen, req, userId);
  if (limited.limited) return limited.response;
  const { projectId } = await ctx.params;
  let idempotencyKey: string;
  try {
    idempotencyKey = requireIdempotencyKey(req);
  } catch (error) {
    if (error instanceof InvalidIdempotencyKeyError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  const db = getDb();
  const [row] = await db
    .select({
      bookId: schema.books.id,
      title: schema.books.title,
      synopsis: schema.books.synopsis,
      genre: schema.projects.genre,
      settings: schema.projects.settings,
      frontMatter: schema.books.frontMatter,
    })
    .from(schema.books)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!row) return Response.json({ error: "Book not found" }, { status: 404 });

  const meteringIdempotencyKey = `project:${projectId}:${idempotencyKey}`;
  const deliveryReceiptRef = optionalDeliveryReceiptRef({
    projectId,
    resource: "cover",
    operationKey: idempotencyKey,
  });
  const loadImmutableDelivery = () =>
    withDbTransaction((tx) =>
      promoteContentToolDeliveryReceiptTransaction<{ url: string }>(tx, {
        userId,
        projectId,
        chapterId: null,
        toolId: COVER_DELIVERY_TOOL_ID,
        operationKey: idempotencyKey,
        deliveryReceiptRef,
      }),
    );
  const hasImmutableReceipt = async () => {
    const [receipt] = await db
      .select({ id: schema.creditLedger.id })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.userId, userId),
          eq(schema.creditLedger.projectId, projectId),
          eq(schema.creditLedger.externalRef, deliveryReceiptRef),
        ),
      )
      .limit(1);
    return Boolean(receipt);
  };
  const currentCoverUrl = () => {
    const value = (row.frontMatter as Record<string, unknown>).coverUrl;
    return typeof value === "string" ? value : null;
  };

  const immutableDelivery = await loadImmutableDelivery();
  if (immutableDelivery) {
    await healReplayedMeteredDelivery({
      userId,
      projectId,
      idempotencyKey,
      deliveryReceiptRef,
      meteringIdempotencyKey,
    });
    return Response.json({ url: currentCoverUrl() ?? immutableDelivery.url, replayed: true });
  }

  const [legacyReplay] = await db
    .select({ id: schema.assets.id, url: schema.assets.blobUrl })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.projectId, projectId),
        eq(schema.assets.kind, "cover"),
        sql`${schema.assets.meta}->>'operationKey' = ${idempotencyKey}`,
      ),
    )
    .limit(1);
  if (legacyReplay) {
    const promoted = await withDbTransaction((tx) =>
      promoteLegacyImageDeliveryTransaction(tx, {
        userId,
        projectId,
        assetId: legacyReplay.id,
        kind: "cover",
        targetId: row.bookId,
        operationKey: idempotencyKey,
        deliveryReceiptRef,
      }),
    );
    if (promoted) {
      await healReplayedMeteredDelivery({
        userId,
        projectId,
        idempotencyKey,
        deliveryReceiptRef,
        meteringIdempotencyKey,
      });
      return Response.json({ url: currentCoverUrl() ?? promoted.url, replayed: true });
    }
  }

  const spendDenied = await authorizeProjectSpend({
    userId,
    projectId,
    operationKind: "optional",
  });
  if (spendDenied) return spendDenied;

  const tier: QualityTier = row.settings.qualityTier ?? "standard";
  const model = MODELS[tier].image;
  const meter: MeterCtx = {
    userId,
    projectId,
    authorizationUsd: COVER_USD,
    idempotencyKey: meteringIdempotencyKey,
    deliveryReceiptRef,
  };
  const callInfo = { role: "content-tool", operation: "cover.generate", model };
  const authorizationUsd = meteredCallAuthorizationUsd(meter, callInfo);
  let result: Awaited<ReturnType<typeof generateText>>;
  try {
    await assertCreditsForUsd(userId, authorizationUsd);
    result = await metered(meter, callInfo, () =>
      generateText({
        model,
        prompt: coverPrompt(row),
        maxOutputTokens: meteredMaxOutputTokens("cover.generate"),
        prepareStep: meteredInputGuard("cover.generate"),
        providerOptions: gatewayOptions(meter, "content-tool"),
      }),
    );
  } catch (error) {
    const spendResponse = projectSpendAccessErrorResponse(error);
    if (spendResponse) return spendResponse;
    if (error instanceof MeteredDeliveryPendingError) {
      return Response.json({ error: error.message, code: "delivery_pending" }, { status: 409 });
    }
    if (error instanceof MeteredDeliveryReplayError) {
      const delivered = await loadImmutableDelivery();
      if (delivered) {
        await healReplayedMeteredDelivery({
          userId,
          projectId,
          idempotencyKey,
          deliveryReceiptRef,
          meteringIdempotencyKey,
        });
        return Response.json({ url: currentCoverUrl() ?? delivered.url, replayed: true });
      }
    }
    if (error instanceof InsufficientCreditsError) {
      return Response.json({ error: "Not enough credits" }, { status: 402 });
    }
    throw error;
  }

  // From here the user has already been debited (metered() charged the model
  // call). Any failure to actually deliver a cover refunds that debit — a
  // charge with nothing to show for it is the one outcome we never allow.
  async function refundAndFail(message: string): Promise<Response> {
    await refundMeteredDelivery(meter, "Cover generation failed after billing — refunded");
    return Response.json({ error: message }, { status: 502 });
  }

  const file = result.files.find((f) => f.mediaType?.startsWith("image/"));
  if (!file) {
    return refundAndFail("The image model returned no image");
  }

  const artContentType = file.mediaType ?? "image/png";
  const matter = readBookMatter(row.frontMatter);

  // Lettering is free and local, so a failure here is never a reason to fail a
  // paid delivery: the painting still ships, exactly as it did before covers
  // had type, and the author can letter it afterwards at no cost.
  let lettered: TitledCover | null = null;
  try {
    lettered = await renderTitledCover({
      art: file.uint8Array,
      artContentType,
      title: row.title,
      subtitle: matter.subtitle ?? null,
      author: matter.author ?? null,
      layout: DEFAULT_COVER_LAYOUT,
      palette: DEFAULT_COVER_PALETTE,
    });
  } catch (error) {
    console.error("Cover lettering failed; delivering the painting untitled", {
      projectId,
      error,
    });
  }

  const uploadId = crypto.randomUUID();
  const contentType = lettered ? lettered.contentType : artContentType;
  let blob: Awaited<ReturnType<typeof put>>;
  let artBlob: Awaited<ReturnType<typeof put>> | null = null;
  try {
    if (lettered) {
      // Both objects or neither: a stored cover whose art went missing cannot
      // be re-lettered, and stored art nobody points at is litter.
      const uploaded = await resolveBlobUploads(
        [
          put(`covers/${projectId}/${uploadId}.png`, Buffer.from(lettered.bytes), {
            access: "public",
            contentType: lettered.contentType,
          }),
          put(`covers/${projectId}/${uploadId}-art.png`, Buffer.from(file.uint8Array), {
            access: "public",
            contentType: artContentType,
          }),
        ],
        "cover",
      );
      blob = uploaded[0]!;
      artBlob = uploaded[1]!;
    } else {
      blob = await put(`covers/${projectId}/${uploadId}.png`, Buffer.from(file.uint8Array), {
        access: "public",
        contentType: artContentType,
      });
    }
  } catch {
    return refundAndFail("Could not store the cover");
  }

  const uploadedPathnames = [blob.pathname, ...(artBlob ? [artBlob.pathname] : [])];
  try {
    await scheduleUnreferencedBlobCleanup({ projectId, pathnames: uploadedPathnames });
  } catch (scheduleError) {
    try {
      await compensateUnreferencedBlobUpload({ projectId, pathnames: uploadedPathnames });
    } catch (cleanupError) {
      try {
        await refundMeteredDelivery(meter, "Cover generation failed after billing — refunded");
      } catch (refundError) {
        throw new AggregateError(
          [
            scheduleError instanceof Error ? scheduleError : new Error(String(scheduleError)),
            cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)),
            refundError instanceof Error ? refundError : new Error(String(refundError)),
          ],
          "Cover delivery, cleanup, and refund all failed",
        );
      }
      throw new AggregateError(
        [
          scheduleError instanceof Error ? scheduleError : new Error(String(scheduleError)),
          cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)),
        ],
        "Cover delivery failed and was refunded, but Blob cleanup could not be made durable",
      );
    }
    return refundAndFail("Could not store the cover");
  }

  let displacedCover: { id: string; pathname: string } | undefined;
  let displacedCandidate: { id: string; pathname: string } | undefined;
  let displacedArt: Array<{ id: string; pathname: string }> = [];
  let deliveredUrl = blob.url;
  try {
    const delivery = await withDbTransaction(async (tx) => {
      const persisted = await persistCoverDeliveryTransaction(tx, {
        userId,
        projectId,
        bookId: row.bookId,
        title: row.title,
        operationKey: idempotencyKey,
        deliveryReceiptRef,
        url: blob.url,
        pathname: blob.pathname,
        contentType,
        sizeBytes: lettered ? lettered.bytes.byteLength : file.uint8Array.byteLength,
        usd: (meter.lastSettlement?.meteredUsd ?? 0).toFixed(6),
        optionalLeaseRefs: meter.optionalOperationLeaseRefs,
        onDisplacedCandidate: (candidate) => {
          displacedCandidate = candidate;
        },
      });
      // The painting rides in the same transaction as the cover it backs, under
      // the same authoring lock, so the two can never disagree.
      let superseded: Array<{ id: string; pathname: string }> = [];
      if (artBlob && !persisted.replayed) {
        superseded = await tx
          .select({ id: schema.assets.id, pathname: schema.assets.blobPathname })
          .from(schema.assets)
          .where(
            and(
              eq(schema.assets.projectId, projectId),
              eq(schema.assets.kind, COVER_ART_ASSET_KIND),
              sql`${schema.assets.meta}->>'role' = ${COVER_ART_ROLE}`,
            ),
          )
          .orderBy(desc(schema.assets.createdAt))
          .limit(4);
        await tx.insert(schema.assets).values({
          projectId,
          kind: COVER_ART_ASSET_KIND,
          blobUrl: artBlob.url,
          blobPathname: artBlob.pathname,
          contentType: artContentType,
          sizeBytes: file.uint8Array.byteLength,
          meta: {
            role: COVER_ART_ROLE,
            layout: DEFAULT_COVER_LAYOUT,
            palette: DEFAULT_COVER_PALETTE,
          },
        });
      }
      return { ...persisted, superseded };
    });
    deliveredUrl = delivery.output.url;
    displacedCover = delivery.displaced;
    // Only after a clean commit: an ambiguous one may have rolled back, and a
    // painting deleted on a guess cannot be re-lettered ever again.
    displacedArt = delivery.superseded;
  } catch (error) {
    // COMMIT acknowledgement is ambiguous. The immutable content-tool row and
    // its unique ledger receipt are stronger evidence than a replaceable asset.
    let committed: { url: string } | null = null;
    try {
      committed = await loadImmutableDelivery();
    } catch (verificationError) {
      throw new AggregateError(
        [
          error instanceof Error ? error : new Error(String(error)),
          verificationError instanceof Error
            ? verificationError
            : new Error(String(verificationError)),
        ],
        "Cover persistence failed and could not be verified",
      );
    }
    if (!committed) {
      if (await hasImmutableReceipt()) {
        throw new AggregateError(
          [error instanceof Error ? error : new Error(String(error))],
          "Cover delivery receipt exists but its immutable output is missing",
        );
      }
      return refundAndFail("Could not store the cover");
    }
    deliveredUrl = committed.url;
    displacedCover = displacedCandidate;
  }

  await completeMeteredDelivery(meter);
  await scheduleReplacedAssetCleanup({
    projectId,
    assetId: displacedCover?.id,
    pathname: displacedCover?.pathname,
  });
  // Superseded paintings are nobody's source any more: the new cover has its
  // own, and no edition ever referenced these.
  await Promise.all(
    displacedArt.map((asset) =>
      scheduleReplacedAssetCleanup({ projectId, assetId: asset.id, pathname: asset.pathname }),
    ),
  );
  return Response.json({
    url: deliveredUrl,
    lettered: Boolean(lettered),
    layout: lettered ? DEFAULT_COVER_LAYOUT : null,
  });
}

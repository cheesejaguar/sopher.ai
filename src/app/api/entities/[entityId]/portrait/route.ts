import { put } from "@vercel/blob";
import { generateText } from "ai";
import { and, eq, sql } from "drizzle-orm";

import {
  gatewayOptions,
  healReplayedMeteredDelivery,
  metered,
  meteredCallAuthorizationUsd,
  completeMeteredDelivery,
  refundMeteredDelivery,
  type MeterCtx,
} from "@/ai/metering";
import { meteredInputGuard, meteredMaxOutputTokens } from "@/ai/metering-limits";
import { MODELS, type QualityTier } from "@/ai/models";
import { getDb, schema, withDbTransaction } from "@/db";
import { replacePortraitAssetTransaction } from "@/db/transaction-operations";
import { getEntityForPortrait } from "@/db/queries/entities";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { assertCreditsForUsd, InsufficientCreditsError } from "@/lib/billing/credits";
import { PORTRAIT_KINDS, PORTRAIT_USD, portraitPrompt } from "@/lib/bible/portraits";
import type { EntityKind } from "@/ai/schemas/entities";
import { InvalidIdempotencyKeyError, requireIdempotencyKey } from "@/lib/billing/idempotency";
import { scheduleReplacedAssetCleanup } from "@/lib/blob-cleanup";
import {
  compensateUnreferencedBlobUpload,
  scheduleUnreferencedBlobCleanup,
} from "@/lib/blob/orphan-cleanup";
import { authorizeProjectSpend, projectSpendAccessErrorResponse } from "@/lib/project-spend-http";

/**
 * Generates one entity portrait on demand. Never called automatically — the
 * image model bills per image and a whole cast would materially change a book's
 * unit economics, so this is always an explicit choice with the price shown.
 *
 * Goes through `metered()` like every other model call, so it lands in
 * `llm_calls` and counts against the user's budget.
 */

export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ entityId: string }> }) {
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
  const { entityId } = await ctx.params;
  let idempotencyKey: string;
  try {
    idempotencyKey = requireIdempotencyKey(req);
  } catch (error) {
    if (error instanceof InvalidIdempotencyKeyError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  const entity = await getEntityForPortrait(entityId);
  if (!entity || entity.userId !== userId) {
    return Response.json({ error: "Entity not found" }, { status: 404 });
  }

  const kind = entity.kind as EntityKind;
  if (!PORTRAIT_KINDS.includes(kind)) {
    return Response.json({ error: `Portraits are not generated for ${kind}s` }, { status: 400 });
  }

  const db = getDb();
  const [project] = await db
    .select({ settings: schema.projects.settings })
    .from(schema.projects)
    .where(eq(schema.projects.id, entity.projectId))
    .limit(1);

  const [replayed] = await db
    .select({ url: schema.assets.blobUrl })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.projectId, entity.projectId),
        eq(schema.assets.kind, "portrait"),
        sql`${schema.assets.meta}->>'entityId' = ${entityId}`,
        sql`${schema.assets.meta}->>'operationKey' = ${idempotencyKey}`,
      ),
    )
    .limit(1);
  if (replayed) {
    await healReplayedMeteredDelivery({
      userId,
      projectId: entity.projectId,
      idempotencyKey,
    });
    return Response.json({ url: replayed.url });
  }
  const spendDenied = await authorizeProjectSpend({
    userId,
    projectId: entity.projectId,
    operationKind: "optional",
  });
  if (spendDenied) return spendDenied;
  const tier: QualityTier = project?.settings.qualityTier ?? "standard";
  const model = MODELS[tier].image;
  const meter: MeterCtx = {
    userId,
    projectId: entity.projectId,
    authorizationUsd: PORTRAIT_USD,
    idempotencyKey: `project:${entity.projectId}:entity:${entityId}:${idempotencyKey}`,
  };
  const callInfo = { role: "content-tool", operation: "entity.portrait", model };
  const authorizationUsd = meteredCallAuthorizationUsd(meter, callInfo);

  try {
    await assertCreditsForUsd(userId, authorizationUsd);

    const prompt = portraitPrompt({
      kind,
      name: entity.name,
      attrs: entity.attrs,
      genre: entity.genre,
    });

    const result = await metered(meter, callInfo, () =>
      generateText({
        model,
        prompt,
        maxOutputTokens: meteredMaxOutputTokens("entity.portrait"),
        prepareStep: meteredInputGuard("entity.portrait"),
        providerOptions: gatewayOptions(meter, "content-tool"),
      }),
    );

    const refundAndFail = async (message: string): Promise<Response> => {
      await refundMeteredDelivery(meter, "Portrait generation failed after billing — refunded");
      return Response.json({ error: message }, { status: 502 });
    };

    const file = result.files.find((f) => f.mediaType?.startsWith("image/"));
    if (!file) {
      return refundAndFail("The image model returned no image");
    }

    const contentType = file.mediaType ?? "image/png";
    let blob: Awaited<ReturnType<typeof put>>;
    try {
      blob = await put(
        `portraits/${entity.projectId}/${entityId}-${crypto.randomUUID()}.png`,
        Buffer.from(file.uint8Array),
        { access: "public", contentType },
      );
    } catch {
      return refundAndFail("Could not store the portrait");
    }

    try {
      await scheduleUnreferencedBlobCleanup({
        projectId: entity.projectId,
        pathnames: [blob.pathname],
      });
    } catch (scheduleError) {
      try {
        await compensateUnreferencedBlobUpload({
          projectId: entity.projectId,
          pathnames: [blob.pathname],
        });
      } catch (cleanupError) {
        try {
          await refundMeteredDelivery(meter, "Portrait generation failed after billing — refunded");
        } catch (refundError) {
          throw new AggregateError(
            [
              scheduleError instanceof Error ? scheduleError : new Error(String(scheduleError)),
              cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)),
              refundError instanceof Error ? refundError : new Error(String(refundError)),
            ],
            "Portrait delivery, cleanup, and refund all failed",
          );
        }
        throw new AggregateError(
          [
            scheduleError instanceof Error ? scheduleError : new Error(String(scheduleError)),
            cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)),
          ],
          "Portrait delivery failed and was refunded, but Blob cleanup could not be made durable",
        );
      }
      return refundAndFail("Could not store the portrait");
    }

    let displacedPortrait: { id: string; pathname: string } | undefined;
    let displacedCandidate: { id: string; pathname: string } | undefined;
    try {
      displacedPortrait = await withDbTransaction((tx) =>
        replacePortraitAssetTransaction(tx, {
          projectId: entity.projectId,
          entityId,
          url: blob.url,
          pathname: blob.pathname,
          contentType,
          sizeBytes: file.uint8Array.byteLength,
          meta: { entityId, prompt, operationKey: idempotencyKey },
          onDisplacedCandidate: (candidate) => {
            displacedCandidate = candidate;
          },
        }),
      );
    } catch (error) {
      let committedAsset: { id: string } | undefined;
      try {
        const [storedAsset] = await db
          .select({ id: schema.assets.id })
          .from(schema.assets)
          .where(
            and(
              eq(schema.assets.projectId, entity.projectId),
              eq(schema.assets.blobPathname, blob.pathname),
            ),
          )
          .limit(1);
        // The exact uploaded asset can only exist if the transaction committed.
        // A newer concurrent portrait may already have advanced the entity
        // pointer by the time this ambiguous acknowledgement is verified.
        if (storedAsset) {
          committedAsset = storedAsset;
        }
      } catch (verificationError) {
        throw new AggregateError(
          [
            error instanceof Error ? error : new Error(String(error)),
            verificationError instanceof Error
              ? verificationError
              : new Error(String(verificationError)),
          ],
          "Portrait persistence failed and could not be verified",
        );
      }
      if (!committedAsset) return refundAndFail("Could not store the portrait");
      displacedPortrait = displacedCandidate;
    }

    await completeMeteredDelivery(meter);
    await scheduleReplacedAssetCleanup({
      projectId: entity.projectId,
      assetId: displacedPortrait?.id,
      pathname: displacedPortrait?.pathname,
    });
    return Response.json({ url: blob.url });
  } catch (error) {
    const spendResponse = projectSpendAccessErrorResponse(error);
    if (spendResponse) return spendResponse;
    if (error instanceof InsufficientCreditsError) {
      return Response.json({ error: "Not enough credits" }, { status: 402 });
    }
    throw error;
  }
}

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { ContentToolError, getContentTool } from "@/ai/content-tools/registry";
import {
  completeMeteredDelivery,
  healReplayedMeteredDelivery,
  refundMeteredDeliveries,
  type MeterCtx,
} from "@/ai/metering";
import { meteredOperationCeilingUsd } from "@/ai/metering-limits";
import { MODELS, type QualityTier } from "@/ai/models";
import { getDb, schema, withDbTransaction } from "@/db";
import { persistContentToolDeliveryTransaction } from "@/db/transaction-operations";
import { getChapterOwnership } from "@/db/queries/books";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import {
  creditsForUsd,
  InsufficientCreditsError,
  releaseCreditReservation,
  reserveCredits,
} from "@/lib/billing/credits";
import { InvalidIdempotencyKeyError, requireIdempotencyKey } from "@/lib/billing/idempotency";
import {
  compensateUnreferencedBlobUpload,
  scheduleUnreferencedBlobCleanup,
} from "@/lib/blob/orphan-cleanup";
import { authorizeProjectSpend, projectSpendAccessErrorResponse } from "@/lib/project-spend-http";

export const maxDuration = 120;

const bodySchema = z.object({
  chapterId: z.uuid(),
  text: z.string().min(1).max(8_000),
  options: z.record(z.string(), z.unknown()).optional(),
});

class ContentToolDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentToolDeliveryError";
  }
}

class AmbiguousContentToolDeliveryError extends AggregateError {
  constructor(errors: Error[], message: string) {
    super(errors, message);
    this.name = "AmbiguousContentToolDeliveryError";
  }
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export async function POST(req: Request, ctx: { params: Promise<{ toolId: string }> }) {
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
  const limited = await rateLimit(LIMITS.llmTool, req, userId);
  if (limited.limited) return limited.response;

  const { toolId } = await ctx.params;
  const tool = getContentTool(toolId);
  if (!tool) return Response.json({ error: "Unknown content tool" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { chapterId, text, options } = parsed.data;
  let idempotencyKey: string;
  try {
    idempotencyKey = requireIdempotencyKey(req);
  } catch (error) {
    if (error instanceof InvalidIdempotencyKeyError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  const db = getDb();
  const [project] = await db
    .select({ settings: schema.projects.settings })
    .from(schema.projects)
    .where(eq(schema.projects.id, ownership.projectId))
    .limit(1);

  const [replayed] = await db
    .select({ output: schema.contentToolRuns.output })
    .from(schema.contentToolRuns)
    .where(
      and(
        eq(schema.contentToolRuns.userId, userId),
        eq(schema.contentToolRuns.projectId, ownership.projectId),
        eq(schema.contentToolRuns.chapterId, chapterId),
        eq(schema.contentToolRuns.toolId, tool.id),
        sql`${schema.contentToolRuns.input}->>'operationKey' = ${idempotencyKey}`,
      ),
    )
    .limit(1);
  if (replayed) {
    await healReplayedMeteredDelivery({
      userId,
      projectId: ownership.projectId,
      idempotencyKey,
    });
    return Response.json({ output: replayed.output, replayed: true });
  }

  const spendDenied = await authorizeProjectSpend({
    userId,
    projectId: ownership.projectId,
    operationKind: "optional",
  });
  if (spendDenied) return spendDenied;

  const tier: QualityTier = project?.settings.qualityTier ?? "standard";
  const models = MODELS[tier];
  const requiredUsd =
    tool.id === "illustration"
      ? meteredOperationCeilingUsd({
          model: models.lineEdit,
          operation: "tool.image.prompt",
        }) +
        meteredOperationCeilingUsd({
          model: models.image,
          operation: "tool.image.generate",
        })
      : meteredOperationCeilingUsd({
          model: models.lineEdit,
          operation: "tool.mermaid",
        });
  const meter: MeterCtx = {
    userId,
    projectId: ownership.projectId,
    settlements: [],
    idempotencyKey: `project:${ownership.projectId}:chapter:${chapterId}:tool:${toolId}:${idempotencyKey}`,
  };
  const reservationRef = `interactive-reservation:${crypto.randomUUID()}`;
  let reservationHeld = false;

  try {
    const authorization = await reserveCredits({
      userId,
      credits: creditsForUsd(requiredUsd),
      externalRef: reservationRef,
      description: `Reserve credits for ${tool.label}`,
      projectId: ownership.projectId,
    });
    if (authorization.status === "insufficient") {
      throw new InsufficientCreditsError(authorization.balance, authorization.credits);
    }
    reservationHeld = true;
    meter.reservationRef = reservationRef;

    const rawOutput = await tool.run(
      {
        meter,
        tier,
        projectId: ownership.projectId,
        chapterId,
      },
      { text, options },
    );
    const output =
      rawOutput.kind === "image"
        ? { kind: rawOutput.kind, url: rawOutput.url, alt: rawOutput.alt }
        : rawOutput;

    if (rawOutput.kind === "image") {
      try {
        // Schedule this before persistence. If COMMIT acknowledgement is lost,
        // the delayed workflow keeps the referenced object; if the transaction
        // rolls back, it removes the orphan without relying on this request.
        await scheduleUnreferencedBlobCleanup({
          projectId: ownership.projectId,
          pathnames: [rawOutput.asset.blobPathname],
        });
      } catch (scheduleError) {
        try {
          await compensateUnreferencedBlobUpload({
            projectId: ownership.projectId,
            pathnames: [rawOutput.asset.blobPathname],
          });
        } catch (cleanupError) {
          throw new AggregateError(
            [asError(scheduleError), asError(cleanupError)],
            "Illustration cleanup could not be made durable",
          );
        }
        throw new ContentToolDeliveryError("Could not store the generated illustration");
      }
    }

    let deliveredOutput = output;
    let replayedDelivery = false;
    try {
      const delivery = await withDbTransaction((tx) =>
        persistContentToolDeliveryTransaction(tx, {
          userId,
          projectId: ownership.projectId,
          chapterId,
          toolId: tool.id,
          operationKey: idempotencyKey,
          text,
          options: options ?? {},
          output,
          usd: (meter.settlements ?? [])
            .reduce((total, settlement) => total + settlement.meteredUsd, 0)
            .toFixed(6),
          asset:
            rawOutput.kind === "image"
              ? {
                  url: rawOutput.url,
                  pathname: rawOutput.asset.blobPathname,
                  contentType: rawOutput.asset.contentType,
                  sizeBytes: rawOutput.asset.sizeBytes,
                  prompt: rawOutput.asset.prompt,
                }
              : undefined,
        }),
      );
      deliveredOutput = delivery.output;
      replayedDelivery = delivery.replayed;
    } catch (persistenceError) {
      // A thrown transaction can still mean COMMIT succeeded and only its
      // acknowledgement was lost. Verify the exact operation and, for an
      // illustration, its exact uploaded asset before deciding to refund.
      let storedRun: { output: unknown } | undefined;
      let storedAsset: { id: string } | undefined;
      try {
        [[storedRun], [storedAsset]] = await Promise.all([
          db
            .select({ output: schema.contentToolRuns.output })
            .from(schema.contentToolRuns)
            .where(
              and(
                eq(schema.contentToolRuns.userId, userId),
                eq(schema.contentToolRuns.projectId, ownership.projectId),
                eq(schema.contentToolRuns.chapterId, chapterId),
                eq(schema.contentToolRuns.toolId, tool.id),
                sql`${schema.contentToolRuns.input}->>'operationKey' = ${idempotencyKey}`,
              ),
            )
            .limit(1),
          rawOutput.kind === "image"
            ? db
                .select({ id: schema.assets.id })
                .from(schema.assets)
                .where(
                  and(
                    eq(schema.assets.projectId, ownership.projectId),
                    eq(schema.assets.blobPathname, rawOutput.asset.blobPathname),
                  ),
                )
                .limit(1)
            : Promise.resolve([]),
        ]);
      } catch (verificationError) {
        throw new AmbiguousContentToolDeliveryError(
          [asError(persistenceError), asError(verificationError)],
          "Content-tool persistence failed and could not be verified",
        );
      }

      const exactCommit =
        Boolean(storedRun) && (rawOutput.kind !== "image" || Boolean(storedAsset));
      if (exactCommit) {
        deliveredOutput = storedRun!.output as typeof output;
      } else if (storedRun || storedAsset) {
        // Partial evidence is not proof of rollback. Keep the debit and the
        // idempotency key so a retry can resolve the durable outcome.
        throw new AmbiguousContentToolDeliveryError(
          [asError(persistenceError)],
          "Content-tool persistence outcome is ambiguous",
        );
      } else {
        throw new ContentToolDeliveryError("Could not save the generated result");
      }
    }

    await completeMeteredDelivery(meter);
    return Response.json({ output: deliveredOutput, replayed: replayedDelivery });
  } catch (error) {
    const spendResponse = projectSpendAccessErrorResponse(error);
    if (spendResponse) return spendResponse;
    if (
      !(error instanceof AmbiguousContentToolDeliveryError) &&
      (meter.settlements?.length ?? 0) > 0
    ) {
      await refundMeteredDeliveries(meter, `${tool.label} could not be delivered — refunded`);
    }
    if (error instanceof InsufficientCreditsError) {
      return Response.json({ error: error.message }, { status: 402 });
    }
    if (error instanceof ContentToolError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof ContentToolDeliveryError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    throw error;
  } finally {
    if (reservationHeld) {
      try {
        await releaseCreditReservation({
          userId,
          externalRef: reservationRef,
          projectId: ownership.projectId,
        });
      } catch (releaseError) {
        console.error("Could not release content-tool reservation", {
          reservationRef,
          releaseError,
        });
      }
    }
  }
}

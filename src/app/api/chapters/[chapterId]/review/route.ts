import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { reviewChapter } from "@/ai/agents/editor";
import {
  healReplayedMeteredDelivery,
  MeteredDeliveryPendingError,
  MeteredDeliveryReplayError,
  refundMeteredDelivery,
  type MeterCtx,
} from "@/ai/metering";
import type { QualityTier } from "@/ai/models";
import { getDb, schema } from "@/db";
import { getChapterById, getChapterOwnership } from "@/db/queries/books";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { InsufficientCreditsError } from "@/lib/billing/credits";
import { InvalidIdempotencyKeyError, requireIdempotencyKey } from "@/lib/billing/idempotency";
import { resolveAnchor } from "@/lib/editor/anchors";
import { toSuggestionDTO } from "@/lib/editor/types";
import { authorizeProjectSpend, projectSpendAccessErrorResponse } from "@/lib/project-spend-http";
import {
  chapterReviewDeliveryReceiptRef,
  findChapterReviewDelivery,
  persistChapterReviewDelivery,
} from "@/lib/chapter-review-delivery";

export const maxDuration = 300;

const bodySchema = z.object({ instruction: z.string().max(2_000).optional() });
const MAX_REVIEW_CHARS = 80_000;

/**
 * Whole-chapter editorial review: one structured call returning anchored
 * suggestions. Anchors are resolved server-side against the current chapter
 * content by first occurrence; unresolvable quotes are skipped (and counted).
 */
export async function POST(req: Request, ctx: { params: Promise<{ chapterId: string }> }) {
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

  const { chapterId } = await ctx.params;
  if (!z.uuid().safeParse(chapterId).success) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }
  let idempotencyKey: string;
  try {
    idempotencyKey = requireIdempotencyKey(req);
  } catch (error) {
    if (error instanceof InvalidIdempotencyKeyError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  const meteringIdempotencyKey = `chapter:${chapterId}:${idempotencyKey}`;
  const deliveryReceiptRef = chapterReviewDeliveryReceiptRef({
    projectId: ownership.projectId,
    chapterId,
    operationKey: idempotencyKey,
  });
  const db = getDb();
  const delivered = await findChapterReviewDelivery({
    userId,
    projectId: ownership.projectId,
    chapterId,
    operationKey: idempotencyKey,
  });
  if (delivered) {
    await healReplayedMeteredDelivery({
      userId,
      projectId: ownership.projectId,
      idempotencyKey,
      deliveryReceiptRef,
      meteringIdempotencyKey,
    });
    delivered.suggestions.sort((a, b) => a.anchor.start - b.anchor.start);
    return Response.json({
      suggestions: delivered.suggestions.map(toSuggestionDTO),
      skipped: delivered.skipped,
    });
  }
  // Replays above are read-only; only a new paid review consumes the limit.
  const limited = await rateLimit(LIMITS.llmEdit, req, userId);
  if (limited.limited) return limited.response;

  const chapter = await getChapterById(chapterId);
  if (!chapter) return Response.json({ error: "Chapter not found" }, { status: 404 });
  if (!chapter.content.trim()) {
    return Response.json({ error: "Chapter has no content to review" }, { status: 400 });
  }
  if (chapter.content.length > MAX_REVIEW_CHARS) {
    return Response.json(
      { error: "This chapter is too long for one review. Split it before requesting suggestions." },
      { status: 413 },
    );
  }

  const spendDenied = await authorizeProjectSpend({
    userId,
    projectId: ownership.projectId,
    operationKind: "optional",
  });
  if (spendDenied) return spendDenied;

  const [project] = await db
    .select({ settings: schema.projects.settings })
    .from(schema.projects)
    .where(eq(schema.projects.id, ownership.projectId))
    .limit(1);
  const tier: QualityTier = project?.settings.qualityTier ?? "standard";

  const meter: MeterCtx = {
    userId,
    projectId: ownership.projectId,
    authorizationUsd: 0.1,
    idempotencyKey: meteringIdempotencyKey,
    deliveryReceiptRef,
  };
  let reviewed;
  try {
    reviewed = await reviewChapter({
      meter,
      tools: {
        userId,
        projectId: ownership.projectId,
        bookId: ownership.bookId,
        chapterNumber: ownership.chapterNumber,
      },
      tier,
      chapterNumber: ownership.chapterNumber,
      content: chapter.content,
      instruction: parsed.data.instruction,
    });
  } catch (error) {
    const spendResponse = projectSpendAccessErrorResponse(error);
    if (spendResponse) return spendResponse;
    if (error instanceof MeteredDeliveryPendingError) {
      return Response.json({ error: error.message, code: "delivery_pending" }, { status: 409 });
    }
    if (error instanceof MeteredDeliveryReplayError) {
      const replay = await findChapterReviewDelivery({
        userId,
        projectId: ownership.projectId,
        chapterId,
        operationKey: idempotencyKey,
      });
      if (replay) {
        await healReplayedMeteredDelivery({
          userId,
          projectId: ownership.projectId,
          idempotencyKey,
          deliveryReceiptRef,
          meteringIdempotencyKey,
        });
        replay.suggestions.sort((a, b) => a.anchor.start - b.anchor.start);
        return Response.json({
          suggestions: replay.suggestions.map(toSuggestionDTO),
          skipped: replay.skipped,
        });
      }
    }
    if (error instanceof InsufficientCreditsError) {
      return Response.json({ error: error.message }, { status: 402 });
    }
    throw error;
  }

  const values: (typeof schema.suggestions.$inferInsert)[] = [];
  let skipped = 0;
  for (const s of reviewed.suggestions) {
    const range = resolveAnchor(chapter.content, s.anchorText);
    if (!range) {
      skipped += 1;
      console.warn(
        `[review] chapter ${chapterId}: skipped unresolvable anchor ${JSON.stringify(
          s.anchorText.slice(0, 80),
        )}`,
      );
      continue;
    }
    values.push({
      chapterId,
      chapterVersion: chapter.version,
      passType: "review",
      suggestionType: s.category,
      severity: s.severity,
      anchor: {
        start: range.start,
        end: range.end,
        originalText: s.anchorText,
        operationKey: idempotencyKey,
      },
      suggestedText: s.replacement,
      explanation: s.rationale,
      // The focus the author asked for, if any — same reasoning as the
      // selection path.
      instruction: parsed.data.instruction ?? null,
      status: "pending",
    });
  }

  if (reviewed.suggestions.length > 0 && values.length === 0) {
    await refundMeteredDelivery(meter, "Chapter review returned unusable anchors — refunded");
    return Response.json(
      { error: "The review could not be anchored to the current chapter. Please try again." },
      { status: 502 },
    );
  }

  let delivery: Awaited<ReturnType<typeof persistChapterReviewDelivery>>;
  try {
    delivery = await persistChapterReviewDelivery({
      userId,
      projectId: ownership.projectId,
      chapterId,
      operationKey: idempotencyKey,
      suggestions: values,
      skipped,
      meteredUsd: meter.lastSettlement?.meteredUsd ?? 0,
      optionalLeaseRefs: meter.optionalOperationLeaseRefs ?? [],
    });
  } catch (persistenceError) {
    try {
      const verified = await findChapterReviewDelivery({
        userId,
        projectId: ownership.projectId,
        chapterId,
        operationKey: idempotencyKey,
      });
      if (verified) {
        delivery = verified;
      } else {
        const [receipt] = await db
          .select({ id: schema.creditLedger.id })
          .from(schema.creditLedger)
          .where(
            and(
              eq(schema.creditLedger.userId, userId),
              eq(schema.creditLedger.projectId, ownership.projectId),
              isNull(schema.creditLedger.runId),
              eq(schema.creditLedger.kind, "adjustment"),
              eq(schema.creditLedger.amount, "0"),
              eq(schema.creditLedger.externalRef, deliveryReceiptRef),
            ),
          )
          .limit(1);
        if (receipt) {
          throw new Error("Chapter-review delivery receipt exists without its immutable output");
        }
        await refundMeteredDelivery(meter, "Chapter review could not be saved — refunded");
        return Response.json({ error: "Could not save review suggestions" }, { status: 503 });
      }
    } catch (verificationError) {
      throw new AggregateError(
        [persistenceError, verificationError],
        "Chapter-review persistence failed and could not be verified",
      );
    }
  }
  meter.optionalOperationLeaseRefs = [];

  // Order by anchor position so the panel reads top-to-bottom.
  delivery.suggestions.sort((a, b) => a.anchor.start - b.anchor.start);

  return Response.json({
    suggestions: delivery.suggestions.map(toSuggestionDTO),
    skipped: delivery.skipped,
  });
}

/** Pending suggestions for a chapter — used by the editor to re-sync. */
export async function GET(_req: Request, ctx: { params: Promise<{ chapterId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }

  const { chapterId } = await ctx.params;
  if (!z.uuid().safeParse(chapterId).success) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }
  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  const db = getDb();
  const pending = await db
    .select()
    .from(schema.suggestions)
    .where(
      and(eq(schema.suggestions.chapterId, chapterId), eq(schema.suggestions.status, "pending")),
    )
    .orderBy(schema.suggestions.createdAt);

  return Response.json({ suggestions: pending.map(toSuggestionDTO), skipped: 0 });
}

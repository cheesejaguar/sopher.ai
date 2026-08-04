import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { proofreadChapter, resolveProofreadAnchors } from "@/ai/agents/proofread";
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
import { toSuggestionDTO } from "@/lib/editor/types";
import { authorizeProjectSpend, projectSpendAccessErrorResponse } from "@/lib/project-spend-http";
import {
  chapterProofreadDeliveryReceiptRef,
  findChapterProofreadDelivery,
  persistChapterProofreadDelivery,
} from "@/lib/chapter-proofread-delivery";

export const maxDuration = 300;

// The pass takes no author instruction on purpose: a focus field is an
// invitation to ask a proofreader for style work, which is the one thing it
// must not do. Unknown keys are stripped rather than rejected.
const bodySchema = z.object({});
/**
 * Below the review pass's 80k because the proofread operation runs on the
 * default metered input envelope (see meteredOperationBudget); a longer
 * chapter would fail the pre-flight guard after the author had already asked
 * for the work.
 */
const MAX_PROOFREAD_CHARS = 40_000;

/**
 * Per-chapter mechanical-correctness pass: one structured call returning
 * whole-sentence corrections anchored to the current chapter content, each
 * carrying the occurrence ordinal of the sentence it corrects.
 *
 * Deliberately not a book-wide pass. A book-wide run would hold the project's
 * single authoring-run slot, and hasActiveAuthoringRun blocks accepting any
 * suggestion while a run is active — the author could not fix a typo while the
 * typo pass was running.
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
  const deliveryReceiptRef = chapterProofreadDeliveryReceiptRef({
    projectId: ownership.projectId,
    chapterId,
    operationKey: idempotencyKey,
  });
  const db = getDb();
  const delivered = await findChapterProofreadDelivery({
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
  // Replays above are read-only; only a new paid pass consumes the limit.
  const limited = await rateLimit(LIMITS.llmEdit, req, userId);
  if (limited.limited) return limited.response;

  const chapter = await getChapterById(chapterId);
  if (!chapter) return Response.json({ error: "Chapter not found" }, { status: 404 });
  if (!chapter.content.trim()) {
    return Response.json({ error: "Chapter has no content to proofread" }, { status: 400 });
  }
  if (chapter.content.length > MAX_PROOFREAD_CHARS) {
    return Response.json(
      { error: "This chapter is too long for one proofread. Split it before running the pass." },
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
    // A floor only — the cheap-tier model's own token ceiling is higher than
    // this and wins in meteredCallAuthorizationCredits.
    authorizationUsd: 0.05,
    idempotencyKey: meteringIdempotencyKey,
    deliveryReceiptRef,
  };
  let proofread;
  try {
    proofread = await proofreadChapter({
      meter,
      tier,
      chapterNumber: ownership.chapterNumber,
      content: chapter.content,
    });
  } catch (error) {
    const spendResponse = projectSpendAccessErrorResponse(error);
    if (spendResponse) return spendResponse;
    if (error instanceof MeteredDeliveryPendingError) {
      return Response.json({ error: error.message, code: "delivery_pending" }, { status: 409 });
    }
    if (error instanceof MeteredDeliveryReplayError) {
      const replay = await findChapterProofreadDelivery({
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

  const anchoring = resolveProofreadAnchors(chapter.content, proofread.corrections);
  const skipped = anchoring.unanchored + anchoring.outOfScope;
  if (skipped > 0) {
    console.warn(
      `[proofread] chapter ${chapterId}: skipped ${anchoring.unanchored} unresolvable and ` +
        `${anchoring.outOfScope} out-of-scope correction(s)`,
    );
  }
  const values: (typeof schema.suggestions.$inferInsert)[] = anchoring.resolved.map((item) => ({
    chapterId,
    chapterVersion: chapter.version,
    passType: "proofread",
    suggestionType: item.correction.category,
    severity: item.correction.severity,
    anchor: {
      start: item.start,
      end: item.end,
      originalText: item.correction.anchorText,
      // Repeated sentences are common in a proofread; without the ordinal the
      // client would highlight and patch the wrong copy.
      occurrence: item.occurrence,
      operationKey: idempotencyKey,
    },
    suggestedText: item.correction.replacement,
    explanation: item.correction.rationale,
    // The pass takes no author instruction, so there is nothing to record.
    instruction: null,
    status: "pending",
  }));

  // A paid pass that hands the author nothing to accept is refunded, however it
  // got there. The two ways it gets there are told apart in the refund
  // description because they mean different things to an operator, and only one
  // of them is a failure the author should be asked to retry.
  if (values.length === 0) {
    if (proofread.corrections.length > 0) {
      await refundMeteredDelivery(
        meter,
        "Chapter proofread returned unusable corrections — refunded",
      );
      return Response.json(
        { error: "The proofread could not be anchored to the current chapter. Please try again." },
        { status: 502 },
      );
    }
    // Nothing reached the anchoring stage at all. Before normalization existed
    // this only happened on a genuinely clean chapter; now it also happens when
    // normalizeProofreadSuggestionList drops every entry the model returned,
    // and proofreadChapter hands back the normalized list alone, so this layer
    // cannot separate the two. Refund either way — neither delivered a
    // correction — but keep going: the empty result is still committed below,
    // because a clean chapter is a real answer and has to stay replayable
    // under the same idempotency key (see persistChapterProofreadDelivery).
    await refundMeteredDelivery(meter, "Chapter proofread produced no corrections — refunded");
  }

  let delivery: Awaited<ReturnType<typeof persistChapterProofreadDelivery>>;
  try {
    delivery = await persistChapterProofreadDelivery({
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
      const verified = await findChapterProofreadDelivery({
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
          throw new Error("Chapter-proofread delivery receipt exists without its immutable output");
        }
        await refundMeteredDelivery(meter, "Chapter proofread could not be saved — refunded");
        return Response.json({ error: "Could not save proofread suggestions" }, { status: 503 });
      }
    } catch (verificationError) {
      throw new AggregateError(
        [persistenceError, verificationError],
        "Chapter-proofread persistence failed and could not be verified",
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

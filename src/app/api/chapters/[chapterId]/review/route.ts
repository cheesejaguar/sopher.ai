import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { reviewChapter } from "@/ai/agents/editor";
import {
  completeMeteredDelivery,
  healReplayedMeteredDelivery,
  meteredCallAuthorizationUsd,
  refundMeteredDelivery,
  type MeterCtx,
} from "@/ai/metering";
import { MODELS, type QualityTier } from "@/ai/models";
import { getDb, schema } from "@/db";
import { getChapterById, getChapterOwnership } from "@/db/queries/books";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { assertCreditsForUsd, InsufficientCreditsError } from "@/lib/billing/credits";
import { InvalidIdempotencyKeyError, requireIdempotencyKey } from "@/lib/billing/idempotency";
import { resolveAnchor } from "@/lib/editor/anchors";
import { toSuggestionDTO } from "@/lib/editor/types";
import { authorizeProjectSpend, projectSpendAccessErrorResponse } from "@/lib/project-spend-http";

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

  const db = getDb();
  const replayed = await db
    .select()
    .from(schema.suggestions)
    .where(
      and(
        eq(schema.suggestions.chapterId, chapterId),
        eq(schema.suggestions.passType, "review"),
        sql`${schema.suggestions.anchor}->>'operationKey' = ${idempotencyKey}`,
      ),
    );
  if (replayed.length > 0) {
    await healReplayedMeteredDelivery({
      userId,
      projectId: ownership.projectId,
      idempotencyKey,
    });
    return Response.json({ suggestions: replayed.map(toSuggestionDTO), skipped: 0 });
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
    idempotencyKey: `chapter:${chapterId}:${idempotencyKey}`,
  };
  let reviewed;
  try {
    await assertCreditsForUsd(
      userId,
      meteredCallAuthorizationUsd(meter, {
        role: "editor",
        operation: "editor.review",
        model: MODELS[tier].editor,
      }),
    );
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

  let rows: Array<typeof schema.suggestions.$inferSelect>;
  try {
    rows = values.length > 0 ? await db.insert(schema.suggestions).values(values).returning() : [];
  } catch {
    await refundMeteredDelivery(meter, "Chapter review could not be saved — refunded");
    return Response.json({ error: "Could not save review suggestions" }, { status: 503 });
  }

  // Order by anchor position so the panel reads top-to-bottom.
  rows.sort((a, b) => a.anchor.start - b.anchor.start);

  await completeMeteredDelivery(meter);
  return Response.json({ suggestions: rows.map(toSuggestionDTO), skipped });
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

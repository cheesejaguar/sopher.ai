import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { reviewChapter } from "@/ai/agents/editor";
import { type QualityTier } from "@/ai/models";
import { getDb, schema } from "@/db";
import { getChapterById, getChapterOwnership } from "@/db/queries/books";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { assertCreditsForUsd, InsufficientCreditsError } from "@/lib/billing/credits";
import { resolveAnchor } from "@/lib/editor/anchors";
import { toSuggestionDTO } from "@/lib/editor/types";

export const maxDuration = 300;

const bodySchema = z.object({ instruction: z.string().max(2_000).optional() });

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

  const { chapterId } = await ctx.params;
  if (!z.uuid().safeParse(chapterId).success) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  const chapter = await getChapterById(chapterId);
  if (!chapter) return Response.json({ error: "Chapter not found" }, { status: 404 });
  if (!chapter.content.trim()) {
    return Response.json({ error: "Chapter has no content to review" }, { status: 400 });
  }

  const db = getDb();
  const [project] = await db
    .select({ settings: schema.projects.settings })
    .from(schema.projects)
    .where(eq(schema.projects.id, ownership.projectId))
    .limit(1);
  const tier: QualityTier = project?.settings.qualityTier ?? "standard";

  const meter = { userId, projectId: ownership.projectId };
  let reviewed;
  try {
    // Pre-gate before the metered call; a full-chapter review runs ~$0.05.
    await assertCreditsForUsd(userId, 0.1);
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
      anchor: { start: range.start, end: range.end, originalText: s.anchorText },
      suggestedText: s.replacement,
      explanation: s.rationale,
      status: "pending",
    });
  }

  const rows =
    values.length > 0 ? await db.insert(schema.suggestions).values(values).returning() : [];

  // Order by anchor position so the panel reads top-to-bottom.
  rows.sort((a, b) => a.anchor.start - b.anchor.start);

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

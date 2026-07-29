import { start } from "workflow/api";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { getChapterOwnership } from "@/db/queries/books";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { assertCreditsForUsd, InsufficientCreditsError } from "@/lib/billing/credits";
import { estimateBookCost } from "@/ai/estimate";
import { generateChapter } from "@/workflows/generate-chapter";
import { isActiveRunConflict } from "@/lib/run-conflict";
import type { GenerationConfig } from "@/lib/run-events";
import type { QualityTier } from "@/ai/models";

export const maxDuration = 60;

/**
 * Regenerates one chapter through the full writing pipeline. The current
 * prose is snapshotted to the revision history before anything is replaced.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ chapterId: string }> }) {
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
  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  const db = getDb();
  const [row] = await db
    .select({
      chapterNumber: schema.chapters.chapterNumber,
      words: schema.projects.targetWordsPerChapter,
      settings: schema.projects.settings,
    })
    .from(schema.chapters)
    .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(eq(schema.chapters.id, chapterId))
    .limit(1);
  if (!row) return Response.json({ error: "Chapter not found" }, { status: 404 });

  // One run per project at a time — same rule as full-book generation, backed
  // by the same partial unique index.
  const [active] = await db
    .select({ id: schema.generationRuns.id })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, ownership.projectId),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
      ),
    )
    .limit(1);
  if (active) {
    return Response.json({ error: "A run is already in progress" }, { status: 409 });
  }

  const tier: QualityTier = row.settings.qualityTier ?? "standard";
  const config: GenerationConfig = { tier, requireOutlineApproval: false, waveSize: 1 };

  try {
    // Single chapters are refused, not suspended: the cost is small and known.
    await assertCreditsForUsd(userId, estimateBookCost(tier, 1, row.words).totalUsd);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return Response.json({ error: "Not enough credits" }, { status: 402 });
    }
    throw error;
  }

  let run: { id: string };
  try {
    [run] = await db
      .insert(schema.generationRuns)
      .values({
        projectId: ownership.projectId,
        userId,
        kind: "chapter",
        status: "queued",
        config,
      })
      .returning({ id: schema.generationRuns.id });
  } catch (error) {
    // Concurrent request won the race past the pre-check; the partial unique
    // index is the backstop, and it deserves a 409 rather than a 500.
    if (isActiveRunConflict(error)) {
      return Response.json({ error: "A run is already in progress" }, { status: 409 });
    }
    throw error;
  }

  const workflowRun = await start(generateChapter, [
    run.id,
    ownership.projectId,
    userId,
    row.chapterNumber,
    config,
  ]);
  await db
    .update(schema.generationRuns)
    .set({ workflowRunId: workflowRun.runId })
    .where(eq(schema.generationRuns.id, run.id));

  return Response.json({ runId: run.id });
}

import { getRun, start } from "workflow/api";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { getChapterOwnership } from "@/db/queries/books";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import {
  assertCreditsForUsd,
  creditsForUsd,
  InsufficientCreditsError,
  reserveCredits,
} from "@/lib/billing/credits";
import { generateChapter } from "@/workflows/generate-chapter";
import { singleChapterRequiredUsd } from "@/workflows/opening-credit-plan";
import { isActiveRunConflict } from "@/lib/run-conflict";
import type { GenerationConfig } from "@/lib/run-events";
import type { QualityTier } from "@/ai/models";
import {
  insertQueuedAuthoringRun,
  scheduleRunReservationCleanup,
  terminalizeAuthoringRun,
} from "@/lib/generation-runs";

export const maxDuration = 60;

/**
 * Regenerates one chapter through the full writing pipeline. The current
 * prose is snapshotted to the revision history before anything is replaced.
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

  // Bound repeated paid-work requests before the serialized workflow hold.
  const limited = await rateLimit(LIMITS.llmEdit, req, userId);
  if (limited.limited) return limited.response;
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
      chapters: schema.projects.targetChapters,
      words: schema.projects.targetWordsPerChapter,
      brief: schema.projects.brief,
      genre: schema.projects.genre,
      styleGuide: schema.projects.styleGuide,
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
        ne(schema.generationRuns.kind, "export"),
      ),
    )
    .limit(1);
  if (active) {
    return Response.json({ error: "A run is already in progress" }, { status: 409 });
  }

  const tier: QualityTier = row.settings.qualityTier ?? "standard";
  let config: GenerationConfig = {
    tier,
    requireOutlineApproval: false,
    waveSize: 1,
    targetChapters: row.chapters,
    targetWordsPerChapter: row.words,
    chapterRegeneration: true,
    inputSnapshot: {
      brief: row.brief ?? "",
      genre: row.genre ?? null,
      styleGuide: row.styleGuide ?? null,
      voiceProfile: row.settings.voiceProfile ?? null,
      pov: row.settings.pov ?? null,
      tense: row.settings.tense ?? null,
      tone: row.settings.tone ?? null,
      styleProfile: row.settings.styleProfile ?? null,
      heatLevel: row.settings.heatLevel ?? null,
      violenceLevel: row.settings.violenceLevel ?? null,
      profanity: row.settings.profanity ?? null,
      avoidTopics: [...(row.settings.avoidTopics ?? [])],
    },
  };

  const optimisticRequiredUsd = singleChapterRequiredUsd(config);
  try {
    // Single chapters are refused, not suspended: the cost is small and known.
    await assertCreditsForUsd(userId, optimisticRequiredUsd);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return Response.json({ error: "Not enough credits" }, { status: 402 });
    }
    throw error;
  }

  let run: { id: string };
  try {
    run = await insertQueuedAuthoringRun({
      projectId: ownership.projectId,
      userId,
      kind: "chapter",
      config,
    });
  } catch (error) {
    // Concurrent request won the race past the pre-check; the partial unique
    // index is the backstop, and it deserves a 409 rather than a 500.
    if (isActiveRunConflict(error)) {
      return Response.json({ error: "A run is already in progress" }, { status: 409 });
    }
    throw error;
  }

  let lockedChapter:
    | {
        chapterNumber: number;
        chapters: number;
        words: number;
        brief: string | null;
        genre: string | null;
        styleGuide: string | null;
        settings: typeof schema.projects.$inferSelect.settings;
      }
    | undefined;
  try {
    [lockedChapter] = await db
      .select({
        chapterNumber: schema.chapters.chapterNumber,
        chapters: schema.projects.targetChapters,
        words: schema.projects.targetWordsPerChapter,
        brief: schema.projects.brief,
        genre: schema.projects.genre,
        styleGuide: schema.projects.styleGuide,
        settings: schema.projects.settings,
      })
      .from(schema.chapters)
      .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .where(
        and(
          eq(schema.chapters.id, chapterId),
          eq(schema.projects.id, ownership.projectId),
          eq(schema.projects.userId, userId),
        ),
      )
      .limit(1);
  } catch (error) {
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: ownership.projectId,
      userId,
      status: "failed",
      error: error instanceof Error ? error.message : "Could not verify the chapter",
      releaseImmediately: true,
    });
    return Response.json({ error: "Could not start chapter regeneration" }, { status: 503 });
  }
  if (!lockedChapter) {
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: ownership.projectId,
      userId,
      status: "cancelled",
      error: "The manuscript changed while regeneration was starting",
      releaseImmediately: true,
    });
    return Response.json(
      { error: "The manuscript changed while regeneration was starting. Please try again." },
      { status: 409 },
    );
  }
  const lockedChapterNumber = lockedChapter.chapterNumber;
  const lockedTier: QualityTier = lockedChapter.settings.qualityTier ?? "standard";
  config = {
    tier: lockedTier,
    requireOutlineApproval: false,
    waveSize: 1,
    targetChapters: lockedChapter.chapters,
    targetWordsPerChapter: lockedChapter.words,
    chapterRegeneration: true,
    inputSnapshot: {
      brief: lockedChapter.brief ?? "",
      genre: lockedChapter.genre ?? null,
      styleGuide: lockedChapter.styleGuide ?? null,
      voiceProfile: lockedChapter.settings.voiceProfile ?? null,
      pov: lockedChapter.settings.pov ?? null,
      tense: lockedChapter.settings.tense ?? null,
      tone: lockedChapter.settings.tone ?? null,
      styleProfile: lockedChapter.settings.styleProfile ?? null,
      heatLevel: lockedChapter.settings.heatLevel ?? null,
      violenceLevel: lockedChapter.settings.violenceLevel ?? null,
      profanity: lockedChapter.settings.profanity ?? null,
      avoidTopics: [...(lockedChapter.settings.avoidTopics ?? [])],
    },
  };
  try {
    const [updatedRun] = await db
      .update(schema.generationRuns)
      .set({ config })
      .where(
        and(
          eq(schema.generationRuns.id, run.id),
          eq(schema.generationRuns.userId, userId),
          eq(schema.generationRuns.status, "queued"),
        ),
      )
      .returning({ id: schema.generationRuns.id });
    if (!updatedRun) throw new Error("Generation run changed before settings were frozen");
  } catch (error) {
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: ownership.projectId,
      userId,
      status: "failed",
      error: error instanceof Error ? error.message : "Could not freeze chapter settings",
      releaseImmediately: true,
    });
    return Response.json({ error: "Could not start chapter regeneration" }, { status: 503 });
  }

  const reservationRef = `generation-reservation:${run.id}:chapter:${lockedChapterNumber}`;
  const requiredUsd = singleChapterRequiredUsd(config);
  let authorization: Awaited<ReturnType<typeof reserveCredits>>;
  try {
    authorization = await reserveCredits({
      userId,
      credits: creditsForUsd(requiredUsd),
      externalRef: reservationRef,
      description: `Reserve credits to regenerate chapter ${lockedChapterNumber}`,
      projectId: ownership.projectId,
      runId: run.id,
    });
  } catch (error) {
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: ownership.projectId,
      userId,
      status: "failed",
      error: error instanceof Error ? error.message : "Credit authorization unavailable",
      releaseImmediately: true,
    });
    return Response.json(
      { error: "Credit authorization is temporarily unavailable" },
      { status: 503 },
    );
  }
  if (authorization.status === "insufficient") {
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: ownership.projectId,
      userId,
      status: "cancelled",
      error: "Not enough credits",
      releaseImmediately: true,
    });
    return Response.json({ error: "Not enough credits" }, { status: 402 });
  }

  let workflowRun: Awaited<ReturnType<typeof start>> | undefined;
  try {
    workflowRun = await start(generateChapter, [
      run.id,
      ownership.projectId,
      userId,
      lockedChapterNumber,
      config,
      reservationRef,
    ]);
    await db
      .update(schema.generationRuns)
      .set({ workflowRunId: workflowRun.runId })
      .where(eq(schema.generationRuns.id, run.id));
  } catch (error) {
    if (workflowRun) {
      try {
        await getRun(workflowRun.runId).cancel();
      } catch {
        // The terminal DB state and delayed reservation cleanup still run.
      }
    }
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: ownership.projectId,
      userId,
      status: "failed",
      error: error instanceof Error ? error.message : "Could not start chapter regeneration",
    });
    await scheduleRunReservationCleanup({ userId, runId: run.id });
    return Response.json({ error: "Could not start chapter regeneration" }, { status: 503 });
  }

  return Response.json({ runId: run.id });
}

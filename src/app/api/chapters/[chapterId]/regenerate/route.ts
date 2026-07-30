import { start } from "workflow/api";
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
import { buildChapterRegenerationConfig, type BookGenerationSnapshot } from "@/lib/book-start";
import {
  insertQueuedAuthoringRun,
  linkAuthoringRunWorkflow,
  markAuthoringRunAcceptanceUncertain,
  reconcileBeforeAuthoringRunConflict,
  RunRequestKeyMismatchError,
  terminalizeAuthoringRun,
  TrialOptionalWorkInProgressError,
} from "@/lib/generation-runs";
import { authorizeProjectSpend } from "@/lib/project-spend-http";
import { InvalidIdempotencyKeyError, requireIdempotencyKey } from "@/lib/billing/idempotency";
import { markAuthoringRunDispatchReady } from "@/lib/authoring-dispatch";

export const maxDuration = 60;

type ChapterProjectSnapshot = BookGenerationSnapshot & {
  chapterNumber: number;
};

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

  const { chapterId } = await ctx.params;
  if (!z.uuid().safeParse(chapterId).success) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }
  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  let requestKey: string;
  try {
    requestKey = requireIdempotencyKey(req);
  } catch (error) {
    if (error instanceof InvalidIdempotencyKeyError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const db = getDb();
  const [requestedRun] = await db
    .select({
      id: schema.generationRuns.id,
      kind: schema.generationRuns.kind,
      status: schema.generationRuns.status,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, ownership.projectId),
        eq(schema.generationRuns.userId, userId),
        eq(schema.generationRuns.requestKey, requestKey),
      ),
    )
    .limit(1);
  if (requestedRun) {
    if (requestedRun.kind !== "chapter") {
      return Response.json(
        { error: "This request key already belongs to a different generation operation" },
        { status: 409 },
      );
    }
    return Response.json(
      {
        runId: requestedRun.id,
        requestKey,
        status: requestedRun.status,
        reattached: true,
      },
      { status: 202 },
    );
  }

  const spendDenied = await authorizeProjectSpend({
    userId,
    projectId: ownership.projectId,
    operationKind: "authoring",
  });
  if (spendDenied) return spendDenied;

  // Replays above are read-only and do not consume the paid-work limit.
  const limited = await rateLimit(LIMITS.llmEdit, req, userId);
  if (limited.limited) return limited.response;

  const [row] = await db
    .select({
      chapterNumber: schema.chapters.chapterNumber,
      title: schema.projects.title,
      experience: schema.projects.experience,
      targetChapters: schema.projects.targetChapters,
      targetWordsPerChapter: schema.projects.targetWordsPerChapter,
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
  await reconcileBeforeAuthoringRunConflict({
    projectId: ownership.projectId,
    userId,
  });
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

  let config = buildChapterRegenerationConfig(row);

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

  let run: Awaited<ReturnType<typeof insertQueuedAuthoringRun>>;
  try {
    run = await insertQueuedAuthoringRun({
      projectId: ownership.projectId,
      userId,
      kind: "chapter",
      config,
      requestKey,
    });
    if (!run.inserted) {
      return Response.json(
        {
          runId: run.id,
          requestKey,
          status: run.status,
          reattached: true,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    if (error instanceof RunRequestKeyMismatchError) {
      return Response.json(
        { error: "This request key already belongs to a different generation operation" },
        { status: 409 },
      );
    }
    if (error instanceof TrialOptionalWorkInProgressError) {
      return Response.json({ error: error.message, code: "trial_busy" }, { status: 409 });
    }
    // Concurrent request won the race past the pre-check; the partial unique
    // index is the backstop, and it deserves a 409 rather than a 500.
    if (isActiveRunConflict(error)) {
      return Response.json({ error: "A run is already in progress" }, { status: 409 });
    }
    throw error;
  }

  let lockedChapter: ChapterProjectSnapshot | undefined;
  try {
    [lockedChapter] = await db
      .select({
        chapterNumber: schema.chapters.chapterNumber,
        title: schema.projects.title,
        experience: schema.projects.experience,
        targetChapters: schema.projects.targetChapters,
        targetWordsPerChapter: schema.projects.targetWordsPerChapter,
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
  config = buildChapterRegenerationConfig(lockedChapter);
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

  const dispatchConfig = await markAuthoringRunDispatchReady({
    runId: run.id,
    projectId: ownership.projectId,
    userId,
    config,
  });
  if (!dispatchConfig) {
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId: ownership.projectId,
      userId,
      status: "failed",
      error: "Chapter settings could not be frozen before Workflow dispatch",
      releaseImmediately: true,
    });
    return Response.json({ error: "Could not start chapter regeneration" }, { status: 503 });
  }
  config = dispatchConfig;

  try {
    const workflowRun = await start(generateChapter, [
      run.id,
      ownership.projectId,
      userId,
      lockedChapterNumber,
      config,
      reservationRef,
    ]);
    try {
      await linkAuthoringRunWorkflow({
        runId: run.id,
        projectId: ownership.projectId,
        userId,
        workflowRunId: workflowRun.runId,
      });
    } catch (error) {
      // generateChapter self-links from Workflow metadata before paid work.
      // A failed redundant write must not cancel an accepted workflow.
      console.error("Chapter workflow accepted before caller-side linkage persisted", {
        runId: run.id,
        workflowRunId: workflowRun.runId,
        error,
      });
    }
  } catch {
    const uncertain = await markAuthoringRunAcceptanceUncertain({
      runId: run.id,
      projectId: ownership.projectId,
      userId,
    });
    return Response.json(
      {
        runId: run.id,
        requestKey,
        status: "queued",
        confirmationPending: uncertain,
      },
      { status: 202 },
    );
  }

  return Response.json({ runId: run.id, requestKey, status: "queued" }, { status: 202 });
}

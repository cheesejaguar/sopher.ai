import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { FatalError, getWorkflowMetadata } from "workflow";

import { reviewChapter } from "@/ai/agents/editor";
import { refundMeteredDelivery, type MeterCtx } from "@/ai/metering";
import { getDb, schema, withDbTransaction } from "@/db";
import {
  AUTHORING_CANCELLATION_MESSAGE,
  AUTHORING_RUN_INACTIVE_MESSAGE,
  throwIfAuthoringCancellationRequested,
} from "@/lib/authoring-cancellation";
import { withPreservedPrimaryError } from "@/lib/async-cleanup";
import { resolveAnchor } from "@/lib/editor/anchors";
import {
  MANUSCRIPT_EDIT_CHAPTER_MAX_CHARS,
  manuscriptEditCreditsPerChapter,
  type ManuscriptEditPassChapterCheckpoint,
  type ManuscriptEditPassConfig,
} from "@/lib/manuscript-edit-pass";

import { notifyAuthoringFailureStep } from "./notify-authoring-failure";
import {
  emitCost,
  emitProgress,
  linkWorkflowRunStep,
  markRunStatus,
  releaseCreditsStep,
  reserveCreditsStep,
} from "./steps";

type EditRunRef = { dbRunId: string; projectId: string; userId: string };

type EditableChapterRef = {
  id: string;
  bookId: string;
  chapterNumber: number;
  version: number;
  contentDigest: string;
};

type ChapterReviewResult = {
  chapterId: string;
  chapterNumber: number;
  suggestionCount: number;
  skippedCount: number;
  replayed: boolean;
};

function digest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function storedEditConfig(value: unknown): ManuscriptEditPassConfig {
  return value as ManuscriptEditPassConfig;
}

/** Freeze the nonempty chapter topology only after this run owns the project. */
export async function loadEditableChapterRefsStep(ref: EditRunRef): Promise<EditableChapterRef[]> {
  "use step";
  await throwIfAuthoringCancellationRequested(ref.dbRunId);
  const rows = await getDb()
    .select({
      id: schema.chapters.id,
      bookId: schema.chapters.bookId,
      chapterNumber: schema.chapters.chapterNumber,
      version: schema.chapters.version,
      content: schema.chapters.content,
    })
    .from(schema.chapters)
    .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(and(eq(schema.projects.id, ref.projectId), eq(schema.projects.userId, ref.userId)))
    .orderBy(schema.chapters.chapterNumber);

  return rows
    .filter((chapter) => chapter.content.trim().length > 0)
    .map((chapter) => ({
      id: chapter.id,
      bookId: chapter.bookId,
      chapterNumber: chapter.chapterNumber,
      version: chapter.version,
      contentDigest: digest(chapter.content),
    }));
}

/**
 * One durable, metered chapter review. The prose remains untouched: only
 * exact-span suggestions are inserted, all tied to this run and chapter
 * version so the existing accept/reject controls retain final author control.
 */
export async function reviewManuscriptChapterStep(
  ref: EditRunRef,
  config: ManuscriptEditPassConfig,
  chapterRef: EditableChapterRef,
  reservationRef: string,
): Promise<ChapterReviewResult> {
  "use step";
  await throwIfAuthoringCancellationRequested(ref.dbRunId);
  const db = getDb();
  const [[run], [chapter]] = await Promise.all([
    db
      .select({ config: schema.generationRuns.config, status: schema.generationRuns.status })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.id, ref.dbRunId),
          eq(schema.generationRuns.projectId, ref.projectId),
          eq(schema.generationRuns.userId, ref.userId),
        ),
      )
      .limit(1),
    db
      .select({
        id: schema.chapters.id,
        bookId: schema.chapters.bookId,
        chapterNumber: schema.chapters.chapterNumber,
        version: schema.chapters.version,
        content: schema.chapters.content,
      })
      .from(schema.chapters)
      .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
      .where(and(eq(schema.chapters.id, chapterRef.id), eq(schema.books.projectId, ref.projectId)))
      .limit(1),
  ]);
  if (!run || !inArrayValue(run.status, ["queued", "running", "awaiting_input"])) {
    throw new FatalError(AUTHORING_RUN_INACTIVE_MESSAGE);
  }
  if (!chapter || chapter.content.trim().length === 0) {
    throw new FatalError(`Chapter ${chapterRef.chapterNumber} is no longer available to review`);
  }
  if (chapter.content.length > MANUSCRIPT_EDIT_CHAPTER_MAX_CHARS) {
    throw new FatalError(
      `Chapter ${chapterRef.chapterNumber} is too long for a safe single-pass review. Split it, then start a new review.`,
    );
  }
  if (
    chapter.version !== chapterRef.version ||
    chapter.chapterNumber !== chapterRef.chapterNumber ||
    digest(chapter.content) !== chapterRef.contentDigest
  ) {
    throw new FatalError(
      `Chapter ${chapterRef.chapterNumber} changed after the edit pass began. No prose was overwritten.`,
    );
  }

  const stored = storedEditConfig(run.config);
  const prior = stored.editPass?.reviewedChapters?.[chapter.id];
  if (
    prior?.chapterVersion === chapter.version &&
    prior.contentDigest === chapterRef.contentDigest
  ) {
    return {
      chapterId: chapter.id,
      chapterNumber: chapter.chapterNumber,
      suggestionCount: prior.suggestionCount,
      skippedCount: 0,
      replayed: true,
    };
  }

  const meter: MeterCtx = {
    userId: ref.userId,
    projectId: ref.projectId,
    runId: ref.dbRunId,
    billingScope: `generation:${ref.dbRunId}:edit-pass:chapter:${chapter.id}:v${chapter.version}`,
    reservationRef,
  };
  const reviewed = await reviewChapter({
    meter,
    tools: {
      userId: ref.userId,
      projectId: ref.projectId,
      bookId: chapter.bookId,
      chapterNumber: chapter.chapterNumber,
    },
    tier: config.tier,
    chapterNumber: chapter.chapterNumber,
    content: chapter.content,
    instruction: config.editPass.instruction,
  });

  // Cancellation can arrive while the provider is in flight. The settled cost
  // remains truthful, but none of that output may commit after Stop was asked.
  await throwIfAuthoringCancellationRequested(ref.dbRunId);

  const values: (typeof schema.suggestions.$inferInsert)[] = [];
  const usedRanges = new Set<string>();
  let skippedCount = 0;
  for (const suggestion of reviewed.suggestions) {
    const range = resolveAnchor(chapter.content, suggestion.anchorText);
    const rangeKey = range ? `${range.start}:${range.end}` : "";
    if (!range || usedRanges.has(rangeKey)) {
      skippedCount += 1;
      continue;
    }
    usedRanges.add(rangeKey);
    values.push({
      chapterId: chapter.id,
      runId: ref.dbRunId,
      chapterVersion: chapter.version,
      passType: "review",
      suggestionType: suggestion.category,
      severity: suggestion.severity,
      anchor: {
        start: range.start,
        end: range.end,
        originalText: suggestion.anchorText,
        operationKey: ref.dbRunId,
      },
      suggestedText: suggestion.replacement,
      explanation: suggestion.rationale,
      instruction: config.editPass.instruction,
      status: "pending",
    });
  }

  if (reviewed.suggestions.length > 0 && values.length === 0) {
    await refundMeteredDelivery(
      meter,
      `Manuscript edit pass chapter ${chapter.chapterNumber} returned unusable anchors — refunded`,
    );
    throw new FatalError(
      `Chapter ${chapter.chapterNumber} could not be anchored safely. No prose was changed.`,
    );
  }

  const checkpoint: ManuscriptEditPassChapterCheckpoint = {
    chapterVersion: chapter.version,
    contentDigest: chapterRef.contentDigest,
    suggestionCount: values.length,
  };

  await persistChapterReview(ref, chapterRef, values, checkpoint);

  return {
    chapterId: chapter.id,
    chapterNumber: chapter.chapterNumber,
    suggestionCount: values.length,
    skippedCount,
    replayed: false,
  };
}

function inArrayValue<T extends string>(value: string, expected: readonly T[]): value is T {
  return expected.includes(value as T);
}

async function persistChapterReview(
  ref: EditRunRef,
  chapterRef: EditableChapterRef,
  values: (typeof schema.suggestions.$inferInsert)[],
  checkpoint: ManuscriptEditPassChapterCheckpoint,
): Promise<void> {
  await withDbTransaction(async (tx) => {
    await tx.execute(
      // Use the same project-authoring lock as cancellation and manual
      // manuscript mutation. It closes the gap between the final cancellation
      // check and suggestion delivery.
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${ref.projectId}, 0)
      )`,
    );
    const [lockedRun] = await tx
      .select({
        status: schema.generationRuns.status,
        config: schema.generationRuns.config,
        cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
      })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.id, ref.dbRunId),
          eq(schema.generationRuns.projectId, ref.projectId),
          eq(schema.generationRuns.userId, ref.userId),
        ),
      )
      .limit(1);
    if (
      !lockedRun ||
      lockedRun.cancellationRequestedAt ||
      !inArrayValue(lockedRun.status, ["queued", "running", "awaiting_input"])
    ) {
      throw new FatalError(AUTHORING_CANCELLATION_MESSAGE);
    }

    const existingConfig = storedEditConfig(lockedRun.config);
    const existing = existingConfig.editPass.reviewedChapters?.[chapterRef.id];
    if (
      existing?.chapterVersion === checkpoint.chapterVersion &&
      existing.contentDigest === checkpoint.contentDigest
    ) {
      return;
    }

    if (values.length > 0) await tx.insert(schema.suggestions).values(values);
    const nextConfig: ManuscriptEditPassConfig = {
      ...existingConfig,
      editPass: {
        ...existingConfig.editPass,
        reviewedChapters: {
          ...existingConfig.editPass.reviewedChapters,
          [chapterRef.id]: checkpoint,
        },
      },
    };
    await tx
      .update(schema.generationRuns)
      .set({ config: nextConfig, heartbeatAt: new Date() })
      .where(eq(schema.generationRuns.id, ref.dbRunId));
  });
}

export async function completeManuscriptEditPassStep(
  ref: EditRunRef,
  chapterRefs: EditableChapterRef[],
): Promise<{ reviewedChapterCount: number; suggestionCount: number }> {
  "use step";
  await throwIfAuthoringCancellationRequested(ref.dbRunId);
  return withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${ref.projectId}, 0)
      )`,
    );
    const [run] = await tx
      .select({
        status: schema.generationRuns.status,
        config: schema.generationRuns.config,
        cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
      })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.id, ref.dbRunId),
          eq(schema.generationRuns.projectId, ref.projectId),
          eq(schema.generationRuns.userId, ref.userId),
        ),
      )
      .limit(1);
    if (
      !run ||
      run.cancellationRequestedAt ||
      !inArrayValue(run.status, ["queued", "running", "awaiting_input"])
    ) {
      throw new FatalError(AUTHORING_CANCELLATION_MESSAGE);
    }

    const config = storedEditConfig(run.config);
    let suggestionCount = 0;
    for (const chapter of chapterRefs) {
      const checkpoint = config.editPass.reviewedChapters?.[chapter.id];
      if (
        !checkpoint ||
        checkpoint.chapterVersion !== chapter.version ||
        checkpoint.contentDigest !== chapter.contentDigest
      ) {
        throw new FatalError(
          `The edit pass did not finish chapter ${chapter.chapterNumber}. No prose was overwritten.`,
        );
      }
      suggestionCount += checkpoint.suggestionCount;
    }
    const completedAt = new Date();
    const nextConfig: ManuscriptEditPassConfig = {
      ...config,
      editPass: {
        ...config.editPass,
        completion: {
          sourceRunId: ref.dbRunId,
          reviewedChapterCount: chapterRefs.length,
          suggestionCount,
          completedAt: completedAt.toISOString(),
        },
      },
    };
    await tx
      .update(schema.generationRuns)
      .set({ config: nextConfig, heartbeatAt: completedAt })
      .where(eq(schema.generationRuns.id, ref.dbRunId));
    return { reviewedChapterCount: chapterRefs.length, suggestionCount };
  });
}

/**
 * Reviews an entire manuscript against one author instruction. The workflow
 * is intentionally sequential: each chapter gets its own wallet reservation,
 * stable billing scope, checkpoint, and cancellation boundary.
 */
export async function editManuscript(
  dbRunId: string,
  projectId: string,
  userId: string,
  config: ManuscriptEditPassConfig,
) {
  "use workflow";
  const ref: EditRunRef = { dbRunId, projectId, userId };
  const { workflowRunId } = getWorkflowMetadata();
  if (!(await linkWorkflowRunStep(ref, workflowRunId))) return;

  try {
    await markRunStatus(ref, "running");
    await emitProgress(ref, {
      type: "stage",
      stage: "editing",
      pct: 3,
      detail: "Reading the manuscript against your direction",
    });
    const chapters = await loadEditableChapterRefsStep(ref);
    if (chapters.length === 0) throw new FatalError("This manuscript has no prose to review");

    const requiredPerChapter = manuscriptEditCreditsPerChapter(config.tier);
    for (let index = 0; index < chapters.length; index += 1) {
      const chapter = chapters[index];
      const startPct = Math.max(5, Math.round(5 + (index / chapters.length) * 88));
      await emitProgress(ref, {
        type: "stage",
        stage: "editing",
        pct: startPct,
        detail: `Reviewing chapter ${chapter.chapterNumber} of ${chapters.length}`,
      });
      await emitProgress(ref, {
        type: "agent",
        agent: "editor",
        message: `Checking chapter ${chapter.chapterNumber} against the author’s direction`,
        chapterNumber: chapter.chapterNumber,
      });

      const authorization = await reserveCreditsStep(
        ref,
        requiredPerChapter,
        `edit-pass:chapter:${chapter.id}:v${chapter.version}`,
      );
      if (!authorization.sufficient || !authorization.reservationRef) {
        throw new FatalError(
          `Not enough credits to review chapter ${chapter.chapterNumber}. Suggestions from earlier chapters are saved.`,
        );
      }

      const result = await withPreservedPrimaryError(
        () => reviewManuscriptChapterStep(ref, config, chapter, authorization.reservationRef!),
        () => releaseCreditsStep(ref, authorization.reservationRef),
        (cleanupError) => {
          console.error("Edit-pass reservation cleanup failed", {
            runId: ref.dbRunId,
            chapterNumber: chapter.chapterNumber,
            cleanupError,
          });
        },
      );
      await emitCost(ref);
      await emitProgress(ref, {
        type: "stage",
        stage: "editing",
        pct: Math.round(5 + ((index + 1) / chapters.length) * 88),
        detail:
          result.suggestionCount === 0
            ? `Chapter ${chapter.chapterNumber} checked — nothing to flag`
            : `Chapter ${chapter.chapterNumber} checked — ${result.suggestionCount} suggestion${result.suggestionCount === 1 ? "" : "s"}`,
      });
    }

    await emitProgress(ref, {
      type: "stage",
      stage: "finalizing",
      pct: 97,
      detail: "Organizing your review queue",
    });
    const completion = await completeManuscriptEditPassStep(ref, chapters);
    const status = await markRunStatus(ref, "completed");
    if (status.outcome === "cancellation_won") {
      await emitProgress(ref, {
        type: "stage",
        stage: "cancelled",
        pct: 100,
        detail: "Stopped safely — completed suggestions remain available",
      });
      return completion;
    }
    await emitProgress(ref, {
      type: "stage",
      stage: "done",
      pct: 100,
      detail:
        completion.suggestionCount === 0
          ? "Review complete — your manuscript already meets that direction"
          : `${completion.suggestionCount} suggestion${completion.suggestionCount === 1 ? "" : "s"} ready for your decision`,
    });
    return completion;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manuscript review failed";
    if (message === AUTHORING_RUN_INACTIVE_MESSAGE) {
      throw error instanceof FatalError ? error : new FatalError(message);
    }
    const cancelled = message === AUTHORING_CANCELLATION_MESSAGE;
    try {
      await markRunStatus(ref, cancelled ? "cancelled" : "failed", message);
      if (!cancelled) await notifyAuthoringFailureStep(ref);
    } catch (statusError) {
      console.error("Could not persist the initiating manuscript edit-pass failure", {
        runId: ref.dbRunId,
        statusError,
      });
    }
    try {
      await emitProgress(
        ref,
        cancelled
          ? { type: "stage", stage: "cancelled", pct: 100, detail: "Stopped safely" }
          : { type: "error", message, fatal: true },
      );
    } catch (eventError) {
      console.warn("Could not publish the initiating manuscript edit-pass failure", {
        runId: ref.dbRunId,
        eventError,
      });
    }
    throw error instanceof FatalError ? error : new FatalError(message);
  }
}

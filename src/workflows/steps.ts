import { FatalError, RetryableError, getWritable } from "workflow";
import { and, eq, sql } from "drizzle-orm";
import { APICallError } from "ai";
import { getDb, schema } from "@/db";
import { generateConcept, persistConcept } from "@/ai/agents/concept";
import { generateOutline, persistOutline } from "@/ai/agents/outline";
import { writeChapter, persistChapter } from "@/ai/agents/chapter-writer";
import { summarizeChapter } from "@/ai/agents/summarizer";
import { editChapter } from "@/ai/agents/editor";
import {
  aggregateContinuityOutcomes,
  persistContinuityIssues,
  runContinuityPhase,
  type ContinuityOutcome,
  type ContinuityReport,
} from "@/ai/agents/continuity";
import type { ReviewPhaseKey } from "@/ai/prompts/review-rubric";
import { BudgetExceededError, checkBudget } from "@/lib/billing/meter";
import { estimateBookCost } from "@/ai/estimate";
import { getOrCreateBook } from "@/db/queries/projects";
import { chapterNs, PROGRESS_NS, type GenerationConfig, type RunEvent } from "@/lib/run-events";
import { isChapterComplete } from "./resume";
import type { BookConcept, BookOutline, ChapterOutlinePlan } from "@/ai/schemas";
import type { MeterCtx } from "@/ai/metering";
import type { ToolCtx } from "@/ai/tools";

type RunRef = {
  dbRunId: string;
  projectId: string;
  userId: string;
};

async function writeEvent(namespace: string, event: RunEvent | string) {
  const writer = getWritable<RunEvent | string>({ namespace }).getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

async function persistEvent(dbRunId: string, event: RunEvent) {
  const db = getDb();
  await db.insert(schema.generationEvents).values({
    runId: dbRunId,
    seq: sql`coalesce((select max(seq) from ${schema.generationEvents} where ${schema.generationEvents.runId} = ${dbRunId}), 0) + 1` as unknown as number,
    type: event.type,
    payload: event,
  });
}

export async function emitProgress(ref: RunRef, event: RunEvent) {
  "use step";
  await writeEvent(PROGRESS_NS, event);
  await persistEvent(ref.dbRunId, event);
}

export async function emitCost(ref: RunRef) {
  "use step";
  const db = getDb();
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.llmCalls.usd}), 0)` })
    .from(schema.llmCalls)
    .where(eq(schema.llmCalls.runId, ref.dbRunId));
  const event: RunEvent = { type: "cost", totalUsd: Number(row?.total ?? 0) };
  await writeEvent(PROGRESS_NS, event);
}

function toWorkflowError(error: unknown): never {
  if (error instanceof BudgetExceededError) {
    throw new FatalError(error.message);
  }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429 || (error.statusCode ?? 0) >= 500) {
      throw new RetryableError(error.message, { retryAfter: "30s" });
    }
    throw new FatalError(error.message);
  }
  // Gateway errors and anything else: preserve the message across the step
  // boundary (raw errors serialize without it) and honor retryability hints.
  if (error && typeof error === "object" && "isRetryable" in error) {
    const message = error instanceof Error ? error.message : String(error);
    if ((error as { isRetryable?: boolean }).isRetryable) {
      throw new RetryableError(message, { retryAfter: "30s" });
    }
    throw new FatalError(message);
  }
  throw new FatalError(error instanceof Error ? error.message : String(error));
}

async function loadRunContext(ref: RunRef) {
  const db = getDb();
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, ref.projectId))
    .limit(1);
  if (!project) throw new FatalError("Project not found");
  const book = await getOrCreateBook(project.id, project.title);
  const meter: MeterCtx = { userId: ref.userId, projectId: ref.projectId, runId: ref.dbRunId };
  return { project, book, meter };
}

export async function markRunStatus(
  ref: RunRef,
  status: "running" | "awaiting_input" | "completed" | "failed" | "cancelled",
  error?: string,
) {
  "use step";
  const db = getDb();
  await db
    .update(schema.generationRuns)
    .set({
      status,
      error: error ?? null,
      ...(status === "running" ? { startedAt: new Date() } : {}),
      ...(status === "completed" || status === "failed" || status === "cancelled"
        ? { completedAt: new Date() }
        : {}),
    })
    .where(eq(schema.generationRuns.id, ref.dbRunId));
  const projectStatus =
    status === "completed" ? "editing" : status === "running" ? "generating" : undefined;
  if (projectStatus) {
    await db
      .update(schema.projects)
      .set({ status: projectStatus, updatedAt: new Date() })
      .where(eq(schema.projects.id, ref.projectId));
  }
}

export async function checkBudgetStep(ref: RunRef, config: GenerationConfig) {
  "use step";
  const db = getDb();
  const [project] = await db
    .select({
      chapters: schema.projects.targetChapters,
      words: schema.projects.targetWordsPerChapter,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, ref.projectId))
    .limit(1);
  if (!project) throw new FatalError("Project not found");
  const estimate = estimateBookCost(config.tier, project.chapters, project.words);
  try {
    await checkBudget(ref.userId, estimate.totalUsd);
  } catch (error) {
    toWorkflowError(error);
  }
}

export async function conceptStep(ref: RunRef, config: GenerationConfig): Promise<BookConcept> {
  "use step";
  const { project, book, meter } = await loadRunContext(ref);
  const tools: ToolCtx = { userId: ref.userId, projectId: ref.projectId, bookId: book.id };
  try {
    const concept = await generateConcept({
      meter,
      tools,
      tier: config.tier,
      brief: project.brief ?? "",
      genre: project.genre ?? undefined,
    });
    await persistConcept(book.id, concept);
    return concept;
  } catch (error) {
    toWorkflowError(error);
  }
}

export async function outlineStep(
  ref: RunRef,
  config: GenerationConfig,
  concept: BookConcept,
  revisionNotes?: string,
): Promise<BookOutline> {
  "use step";
  const { project, book, meter } = await loadRunContext(ref);
  const tools: ToolCtx = { userId: ref.userId, projectId: ref.projectId, bookId: book.id };
  try {
    const outline = await generateOutline({
      meter,
      tools,
      tier: config.tier,
      concept,
      brief: project.brief ?? undefined,
      genre: project.genre ?? undefined,
      chapterCount: project.targetChapters,
      targetWordsPerChapter: project.targetWordsPerChapter,
      revisionNotes,
    });
    await persistOutline(book.id, outline);
    return outline;
  } catch (error) {
    toWorkflowError(error);
  }
}

export async function writeChapterStep(
  ref: RunRef,
  config: GenerationConfig,
  chapterNumber: number,
): Promise<{ chapterNumber: number; wordCount: number; qualityScore: number }> {
  "use step";
  const { project, book, meter } = await loadRunContext(ref);
  const db = getDb();

  // Resume: a retry run reuses chapters a prior run already finished.
  const [existing] = await db
    .select({
      status: schema.chapters.status,
      content: schema.chapters.content,
      wordCount: schema.chapters.wordCount,
      qualityScore: schema.chapters.qualityScore,
    })
    .from(schema.chapters)
    .where(
      and(eq(schema.chapters.bookId, book.id), eq(schema.chapters.chapterNumber, chapterNumber)),
    )
    .limit(1);
  if (isChapterComplete(existing)) {
    await writeEvent(PROGRESS_NS, {
      type: "chapter",
      chapterNumber,
      status: existing.status as "drafted" | "edited" | "final",
      wordCount: existing.wordCount,
      qualityScore: existing.qualityScore ? Number(existing.qualityScore) : undefined,
    });
    return {
      chapterNumber,
      wordCount: existing.wordCount,
      qualityScore: existing.qualityScore ? Number(existing.qualityScore) : 0.75,
    };
  }

  const [outlineRow] = await db
    .select()
    .from(schema.outlines)
    .where(eq(schema.outlines.bookId, book.id))
    .orderBy(sql`${schema.outlines.version} desc`)
    .limit(1);
  if (!outlineRow) throw new FatalError("No outline to write from");
  const outline = outlineRow.content as BookOutline;
  const chapterOutline = outline.chapters.find((c) => c.number === chapterNumber) as
    ChapterOutlinePlan | undefined;
  if (!chapterOutline) throw new FatalError(`Chapter ${chapterNumber} missing from outline`);

  const prevSummaries = await db
    .select({
      chapterNumber: schema.chapters.chapterNumber,
      title: schema.chapters.title,
      summary: schema.chapters.summary,
    })
    .from(schema.chapters)
    .where(
      and(
        eq(schema.chapters.bookId, book.id),
        sql`${schema.chapters.chapterNumber} < ${chapterNumber}`,
        sql`${schema.chapters.summary} is not null`,
      ),
    )
    .orderBy(schema.chapters.chapterNumber);

  await db
    .update(schema.chapters)
    .set({ status: "drafting", updatedAt: new Date() })
    .where(
      and(eq(schema.chapters.bookId, book.id), eq(schema.chapters.chapterNumber, chapterNumber)),
    );
  await writeEvent(PROGRESS_NS, { type: "chapter", chapterNumber, status: "drafting" });

  const proseWriter = getWritable<string>({ namespace: chapterNs(chapterNumber) }).getWriter();
  try {
    const settings = project.settings ?? {};
    const result = await writeChapter({
      meter,
      tools: {
        userId: ref.userId,
        projectId: ref.projectId,
        bookId: book.id,
        chapterNumber,
      },
      tier: config.tier,
      chapterNumber,
      totalChapters: project.targetChapters,
      chapterOutline,
      prevSummaries: prevSummaries.slice(-4),
      genre: project.genre ?? undefined,
      styleGuide: project.styleGuide ?? undefined,
      voiceProfile: settings.voiceProfile,
      plotStructure: outline.plotStructure,
      targetWords: chapterOutline.targetWords ?? project.targetWordsPerChapter,
      onProseDelta: async (delta) => {
        await proseWriter.write(delta);
      },
    });

    await persistChapter(
      {
        tools: { userId: ref.userId, projectId: ref.projectId, bookId: book.id, chapterNumber },
        chapterNumber,
      } as Parameters<typeof persistChapter>[0],
      result,
    );
    await summarizeChapter({
      meter,
      bookId: book.id,
      chapterNumber,
      chapterTitle: chapterOutline.title,
      content: result.content,
      tier: config.tier,
    });

    await writeEvent(PROGRESS_NS, {
      type: "chapter",
      chapterNumber,
      status: "drafted",
      wordCount: result.wordCount,
      qualityScore: result.qualityScore,
    });
    return {
      chapterNumber,
      wordCount: result.wordCount,
      qualityScore: result.qualityScore,
    };
  } catch (error) {
    toWorkflowError(error);
  } finally {
    proseWriter.releaseLock();
  }
}

export async function editChapterStep(
  ref: RunRef,
  config: GenerationConfig,
  chapterNumber: number,
  issueNotes?: string,
): Promise<{ chapterNumber: number; changed: boolean }> {
  "use step";
  const { project, book, meter } = await loadRunContext(ref);
  const db = getDb();
  const [chapter] = await db
    .select()
    .from(schema.chapters)
    .where(
      and(eq(schema.chapters.bookId, book.id), eq(schema.chapters.chapterNumber, chapterNumber)),
    )
    .limit(1);
  if (!chapter || !chapter.content) return { chapterNumber, changed: false };

  try {
    const edited = await editChapter({
      meter,
      tools: { userId: ref.userId, projectId: ref.projectId, bookId: book.id, chapterNumber },
      tier: config.tier,
      chapterNumber,
      content: issueNotes
        ? `${chapter.content}\n\n<!-- CONTINUITY NOTES TO ADDRESS -->\n${issueNotes}`
        : chapter.content,
      styleGuide: project.styleGuide ?? undefined,
    });
    if (edited.changed) {
      await db.insert(schema.chapterRevisions).values({
        chapterId: chapter.id,
        content: chapter.content,
        source: "writer",
        runId: ref.dbRunId,
      });
      await db
        .update(schema.chapters)
        .set({
          content: edited.content,
          wordCount: edited.content.split(/\s+/).filter(Boolean).length,
          status: "edited",
          version: chapter.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.chapters.id, chapter.id));
    }
    await writeEvent(PROGRESS_NS, {
      type: "chapter",
      chapterNumber,
      status: "edited",
    });
    return { chapterNumber, changed: edited.changed };
  } catch (error) {
    toWorkflowError(error);
  }
}

export async function readQualityGate(ref: RunRef, threshold: number): Promise<number[]> {
  "use step";
  const db = getDb();
  const { book } = await loadRunContext(ref);
  const rows = await db
    .select({
      chapterNumber: schema.chapters.chapterNumber,
      qualityScore: schema.chapters.qualityScore,
    })
    .from(schema.chapters)
    .where(eq(schema.chapters.bookId, book.id));
  return rows
    .filter((r) => r.qualityScore !== null && Number(r.qualityScore) < threshold)
    .map((r) => r.chapterNumber);
}

/**
 * One rubric phase per step: a retry after a mid-review failure replays the
 * finished phases from their checkpoints instead of re-billing them.
 */
export async function continuityPhaseStep(
  ref: RunRef,
  config: GenerationConfig,
  phaseKey: ReviewPhaseKey,
): Promise<ContinuityOutcome> {
  "use step";
  const { book, meter } = await loadRunContext(ref);
  try {
    return await runContinuityPhase(
      {
        meter,
        tools: { userId: ref.userId, projectId: ref.projectId, bookId: book.id },
        tier: config.tier,
      },
      phaseKey,
    );
  } catch (error) {
    toWorkflowError(error);
  }
}

export async function continuityFinalizeStep(
  ref: RunRef,
  outcomes: ContinuityOutcome[],
): Promise<ContinuityReport> {
  "use step";
  const { book } = await loadRunContext(ref);
  const report = aggregateContinuityOutcomes(outcomes);
  await persistContinuityIssues(book.id, ref.dbRunId, report.issues);
  await writeEvent(PROGRESS_NS, {
    type: "review",
    score: report.score,
    recommendation: report.recommendation,
    issueCount: report.issues.length,
  });
  return report;
}

export async function finalizeStep(ref: RunRef): Promise<void> {
  "use step";
  const db = getDb();
  await db
    .update(schema.chapters)
    .set({ status: "final" })
    .where(
      sql`${schema.chapters.bookId} = (select id from ${schema.books} where ${schema.books.projectId} = ${ref.projectId}) and ${schema.chapters.status} in ('drafted', 'edited')`,
    );
}

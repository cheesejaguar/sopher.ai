import { FatalError, RetryableError, getWritable } from "workflow";
import { and, eq, sql } from "drizzle-orm";
import { APICallError } from "ai";
import { getDb, schema } from "@/db";
import { generateConcept, persistConcept } from "@/ai/agents/concept";
import { generateOutline, persistOutline } from "@/ai/agents/outline";
import { writeChapter, persistChapter } from "@/ai/agents/chapter-writer";
import { summarizeChapter } from "@/ai/agents/summarizer";
import { buildEntityBible } from "@/ai/agents/entity-bible";
import { editChapter } from "@/ai/agents/editor";
import {
  aggregateContinuityOutcomes,
  persistContinuityIssues,
  runContinuityPhase,
  type ContinuityOutcome,
  type ContinuityReport,
} from "@/ai/agents/continuity";
import type { ReviewPhaseKey } from "@/ai/prompts/review-rubric";
import { creditsForUsd, getBalance } from "@/lib/billing/credits";
import { estimateBookCost } from "@/ai/estimate";
import { getOrCreateBook } from "@/db/queries/projects";
import { listEntities } from "@/db/queries/entities";
import { sendBookFinishedEmail, sendCreditsPausedEmail } from "@/lib/email/send";
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
  throw new RetryableError(error instanceof Error ? error.message : String(error), {
    retryAfter: "30s",
  });
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

/**
 * Reports the wallet against the cost of the NEXT stretch of work — one wave of
 * chapters — not the whole remaining book. That is deliberate: the welcome
 * grant should let an author watch a real book begin (concept, outline, bible,
 * the first chapters) and pause at a natural seam, rather than being refused at
 * the door for not affording the ending.
 *
 * Returns rather than throws: the orchestrator suspends on a top-up hook when
 * the balance runs short, so every chapter already drafted is kept.
 */
export async function creditCheckStep(
  ref: RunRef,
  config: GenerationConfig,
  chaptersToCover: number,
  opts?: { includeBookOverhead?: boolean },
): Promise<{ balance: number; required: number; sufficient: boolean }> {
  "use step";
  const db = getDb();
  const [project] = await db
    .select({
      words: schema.projects.targetWordsPerChapter,
      chapters: schema.projects.targetChapters,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, ref.projectId))
    .limit(1);
  if (!project) throw new FatalError("Project not found");

  const count = Math.min(Math.max(chaptersToCover, 1), project.chapters);
  // Only the per-chapter stages: estimateBookCost totals book-level overhead
  // (concept, outline, continuity) too, which for a mid-book wave check would
  // demand credits for work that already ran or runs once at the end.
  const estimate = estimateBookCost(config.tier, count, project.words);
  const perChapterStages = new Set([
    "Chapter drafting",
    "Critique + revisions",
    "Editorial pass",
    "Summaries + character bible",
  ]);
  // Pre-flight also charges for the book-level stages (concept, outline,
  // bible, continuity) that run before/after the chapters; mid-book wave
  // checks must not, since that work already ran or runs once at the end.
  const requiredUsd = estimate.stages
    .filter((stage) => opts?.includeBookOverhead || perChapterStages.has(stage.stage))
    .reduce((acc, stage) => acc + stage.usd, 0);
  const required = creditsForUsd(requiredUsd);
  const balance = await getBalance(ref.userId);
  return { balance, required, sufficient: balance >= required };
}

export async function conceptStep(ref: RunRef, config: GenerationConfig): Promise<BookConcept> {
  "use step";
  const { project, book, meter } = await loadRunContext(ref);
  // Resume: a retry run reuses the concept a prior run already persisted.
  if (book.concept && typeof book.concept === "object" && Object.keys(book.concept).length > 0) {
    return book.concept as BookConcept;
  }
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
  // Resume: without in-run revision notes, a retry reuses the persisted
  // outline instead of regenerating it and clobbering chapter summaries.
  if (revisionNotes === undefined) {
    const db = getDb();
    const [existing] = await db
      .select({ content: schema.outlines.content })
      .from(schema.outlines)
      .where(eq(schema.outlines.bookId, book.id))
      .orderBy(sql`${schema.outlines.version} desc`)
      .limit(1);
    if (existing) return existing.content as BookOutline;
  }
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

/**
 * Builds the story bible from the concept + outline before any chapter drafts.
 * Idempotent: seeding uses onConflictDoNothing, so a retry re-derives without
 * clobbering canon that chapters have already added.
 */
export async function entityBibleStep(
  ref: RunRef,
  config: GenerationConfig,
  concept: BookConcept,
  outline: BookOutline,
): Promise<{ entityCount: number; relationshipCount: number }> {
  "use step";
  const { project, book, meter } = await loadRunContext(ref);
  try {
    const existing = await listEntities(book.id);
    return await buildEntityBible({
      meter,
      bookId: book.id,
      tier: config.tier,
      concept,
      outline,
      genre: project.genre ?? undefined,
      existingNames: existing.map((e) => e.name),
    });
  } catch (error) {
    toWorkflowError(error);
  }
}

/**
 * Prepares a chapter for regeneration: snapshots the current prose into the
 * revision history, then clears content and status so writeChapterStep's
 * resume check treats it as unwritten. The old text is one restore away.
 */
export async function resetChapterStep(ref: RunRef, chapterNumber: number): Promise<void> {
  "use step";
  const { book } = await loadRunContext(ref);
  const db = getDb();
  const [chapter] = await db
    .select({ id: schema.chapters.id, content: schema.chapters.content })
    .from(schema.chapters)
    .where(
      and(eq(schema.chapters.bookId, book.id), eq(schema.chapters.chapterNumber, chapterNumber)),
    )
    .limit(1);
  if (!chapter) return;

  if (chapter.content.trim().length > 0) {
    await db
      .insert(schema.chapterRevisions)
      .values({ chapterId: chapter.id, content: chapter.content, source: "regenerate" });
  }
  await db
    .update(schema.chapters)
    .set({
      content: "",
      // Summary stays: it doubles as regeneration context when the outline no
      // longer has an entry for this number (user-added or reordered chapters).
      wordCount: 0,
      qualityScore: null,
      status: "planned",
      // Invalidate any open editor tab: a stale baseVersion must conflict
      // rather than silently overwrite the freshly generated prose.
      version: sql`${schema.chapters.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.chapters.id, chapter.id));
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
      title: schema.chapters.title,
      content: schema.chapters.content,
      summary: schema.chapters.summary,
      wordCount: schema.chapters.wordCount,
      qualityScore: schema.chapters.qualityScore,
    })
    .from(schema.chapters)
    .where(
      and(eq(schema.chapters.bookId, book.id), eq(schema.chapters.chapterNumber, chapterNumber)),
    )
    .limit(1);
  if (isChapterComplete(existing)) {
    // Backfill: a retry after persistChapter succeeded but summarizeChapter
    // failed must still write the summary and character-bible facts.
    if (existing.summary == null) {
      try {
        await summarizeChapter({
          meter,
          bookId: book.id,
          chapterNumber,
          chapterTitle: existing.title,
          content: existing.content,
          tier: config.tier,
        });
      } catch (error) {
        toWorkflowError(error);
      }
    }
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
  let chapterOutline = outline.chapters.find((c) => c.number === chapterNumber) as
    ChapterOutlinePlan | undefined;
  if (!chapterOutline) {
    // The author restructured chapters after the outline was written (added,
    // moved, or is regenerating one) — synthesize an entry from what the
    // chapter row itself knows rather than refusing.
    chapterOutline = {
      number: chapterNumber,
      title: existing?.title ?? `Chapter ${chapterNumber}`,
      summary:
        existing?.summary ??
        "Continue the story naturally from the surrounding chapters, honoring the story bible.",
      keyEvents: [],
      charactersPresent: [],
      emotionalArc: "transition",
      openingHook: "Pick up where the previous chapter's summary leaves off.",
      closingHook: "Hand off cleanly to the next chapter's summary.",
      targetWords: project.targetWordsPerChapter,
    };
  }

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
      content: chapter.content,
      revisionNotes: issueNotes,
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

  // Tell the author. Best-effort: a book that finished but could not say so
  // is still a finished book, so email failures never fail the step.
  try {
    const [row] = await db
      .select({
        email: schema.users.email,
        title: schema.books.title,
        chapters: sql<number>`(select count(*)::int from ${schema.chapters} where ${schema.chapters.bookId} = ${schema.books.id})`,
        words: sql<number>`(select coalesce(sum(${schema.chapters.wordCount}), 0)::int from ${schema.chapters} where ${schema.chapters.bookId} = ${schema.books.id})`,
      })
      .from(schema.books)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
      .where(eq(schema.projects.id, ref.projectId))
      .limit(1);
    if (row?.email) {
      await sendBookFinishedEmail({
        to: row.email,
        bookTitle: row.title,
        projectId: ref.projectId,
        chapterCount: row.chapters,
        wordCount: row.words,
      });
    }
  } catch (error) {
    console.warn("[email] book-finished notification failed:", error);
  }
}

/** Emails the author that writing paused for credits. Best-effort, own step. */
export async function notifyCreditsPausedStep(
  ref: RunRef,
  balance: number,
  required: number,
): Promise<void> {
  "use step";
  try {
    const db = getDb();
    const [row] = await db
      .select({ email: schema.users.email, title: schema.books.title })
      .from(schema.books)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
      .where(eq(schema.projects.id, ref.projectId))
      .limit(1);
    if (row?.email) {
      await sendCreditsPausedEmail({
        to: row.email,
        bookTitle: row.title,
        projectId: ref.projectId,
        balance,
        required,
      });
    }
  } catch (error) {
    console.warn("[email] credits-paused notification failed:", error);
  }
}

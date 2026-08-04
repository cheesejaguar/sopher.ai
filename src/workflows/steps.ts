import { createHash } from "node:crypto";
import { FatalError, RetryableError, getStepMetadata, getWritable } from "workflow";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { APICallError } from "ai";
import { getDb, schema, withDbTransaction, type DbTransaction } from "@/db";
import { generateConcept, persistConcept } from "@/ai/agents/concept";
import { generateCreativeQuestion } from "@/ai/agents/creative-director";
import {
  generateOutline,
  persistOutline,
  type OutlineGenerationCheckpoint,
} from "@/ai/agents/outline";
import { writeChapter } from "@/ai/agents/chapter-writer";
import { generateChapterSummary, persistChapterSummary } from "@/ai/agents/summarizer";
import { generateEntityBible, persistEntityBible } from "@/ai/agents/entity-bible";
import { editChapter } from "@/ai/agents/editor";
import {
  aggregateContinuityOutcomes,
  continuityPhaseKeys,
  persistContinuityIssues,
  runContinuityPhase,
  type ContinuityOutcome,
  type ContinuityReport,
} from "@/ai/agents/continuity";
import type { ReviewPhaseKey } from "@/ai/prompts/review-rubric";
import {
  canonicalizeCreditRequirement,
  creditsForUsd,
  getBalance,
  releaseCreditReservation,
  reserveCredits,
} from "@/lib/billing/credits";
import { netRunCreditsUsedSql } from "@/lib/billing/run-spend";
import { getOrCreateBook } from "@/db/queries/projects";
import { listEntities, seedEntities } from "@/db/queries/entities";
import {
  sendBookFinishedEmail,
  sendCreativeDecisionEmail,
  sendCreditsPausedEmail,
  sendIncludedStoryPausedEmail,
  sendOutlineApprovalEmail,
} from "@/lib/email/send";
import {
  chapterNs,
  generationBillingScope,
  nextGenerationPreparationAction,
  PROGRESS_NS,
  retryRunFromSavedWork,
  severResumeBillingLineage,
  stagedArtifactsMatch,
  type GenerationConfig,
  type RunEvent,
} from "@/lib/run-events";
import { generationResetSource, shouldArchiveGenerationReset } from "@/lib/generation-archive";
import {
  chapterTopologyFingerprint,
  cachedEditOutputAlreadyApplied,
  manuscriptDigest,
  outlineStateFingerprint,
  type ManuscriptStateRow,
} from "@/lib/manuscript-state";
import {
  chapterWaveRequiredUsd,
  continuityPhaseRequiredUsd,
  editorialWaveRequiredUsd,
  entityBibleRequiredUsd,
  freshOpeningRequiredUsd,
  conceptRequiredUsd,
  creativeQuestionRequiredUsd,
  initialOutlineRequiredUsd,
  outlineRevisionRequiredUsd,
  resumeOpeningRequiredUsd,
  type ResumeChapterMeteredWork,
} from "./opening-credit-plan";
import { isChapterComplete, isChapterProductionComplete, planFreshRunChapter } from "./resume";
import { runCostEvent } from "./run-cost";
import {
  bookOutlineSchema,
  conceptSchema,
  type BookConcept,
  type BookOutline,
  type ChapterOutlinePlan,
} from "@/ai/schemas";
import type { MeterCtx } from "@/ai/metering";
import type { ToolCtx } from "@/ai/tools";
import { buildFrozenAuthoringContract } from "@/ai/authoring-guidelines";
import { linkAuthoringRunWorkflow, transitionAuthoringRunState } from "@/lib/generation-runs";
import { nextRunEventSequence, persistRunEvent } from "@/lib/run-event-store";
import { recordAuthoringIncident, resolveAuthoringIncident } from "@/lib/authoring-incidents";
import type { AuthoringFailureDetails } from "@/lib/authoring-failures";
import type { DegradedPass } from "@/lib/authoring-degradation";
import {
  AUTHORING_CANCELLATION_MESSAGE,
  AUTHORING_RUN_INACTIVE_MESSAGE,
  throwIfAuthoringCancellationRequested,
} from "@/lib/authoring-cancellation";
import {
  allocateAuthoringPause,
  clearAuthoringPause,
  consumeAuthoringRunInput,
  markAuthoringPauseRegistered,
} from "@/lib/authoring-inputs";
import type { AuthoringRunInputKind } from "@/db/schema";
import type { AuthoringPauseDetails } from "@/db/schema";
import {
  consumeCreativeDecision,
  creativeDecisionPrompt,
  markCreativeQuestionPauseRegistered,
  persistCreativeQuestion,
  readPendingCreativeQuestion,
  type CreativeQuestionForAuthor,
} from "@/lib/creative-decisions";

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

async function persistAndPublishProgress(
  ref: RunRef,
  event: RunEvent,
  subkey: string,
): Promise<void> {
  const { stepId } = getStepMetadata();
  await persistRunEvent({
    runId: ref.dbRunId,
    eventKey: `${stepId}:${subkey}`,
    event,
  });
  try {
    await writeEvent(PROGRESS_NS, event);
  } catch (error) {
    console.warn("Could not publish persisted authoring progress", {
      runId: ref.dbRunId,
      eventType: event.type,
      error,
    });
  }
}

export async function emitProgress(ref: RunRef, event: RunEvent) {
  "use step";
  const { stepId } = getStepMetadata();
  try {
    await persistRunEvent({ runId: ref.dbRunId, eventKey: stepId, event });
  } catch (error) {
    try {
      await recordAuthoringIncident({
        runId: ref.dbRunId,
        projectId: ref.projectId,
        category: "event_persistence",
        severity: "critical",
        dedupeKey: `event-persistence:${stepId}`,
        evidence: {
          eventType: event.type,
          stage: event.type === "stage" ? event.stage : null,
        },
      });
    } catch {
      // The original database error is the actionable failure.
    }
    throw error;
  }
  await resolveAuthoringIncident({
    runId: ref.dbRunId,
    dedupeKey: `event-persistence:${stepId}`,
  });
  try {
    await writeEvent(PROGRESS_NS, event);
  } catch (error) {
    // The database projection is canonical and the client polls health beside
    // the stream. A transient stream failure must not repeat paid work.
    console.warn("Could not publish persisted authoring progress", {
      runId: ref.dbRunId,
      eventType: event.type,
      error,
    });
  }
}

export async function emitCost(ref: RunRef) {
  "use step";
  const db = getDb();
  const [[provider], [ledger]] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${schema.llmCalls.usd}), 0)` })
      .from(schema.llmCalls)
      .where(eq(schema.llmCalls.runId, ref.dbRunId)),
    db
      .select({
        total: netRunCreditsUsedSql(),
      })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.runId, ref.dbRunId)),
  ]);
  const event = runCostEvent(Number(provider?.total ?? 0), Number(ledger?.total ?? 0));
  const { stepId } = getStepMetadata();
  await persistRunEvent({ runId: ref.dbRunId, eventKey: stepId, event });
  try {
    await writeEvent(PROGRESS_NS, event);
  } catch (error) {
    console.warn("Could not publish persisted authoring cost", {
      runId: ref.dbRunId,
      error,
    });
  }
}

function toWorkflowError(error: unknown): never {
  if (error instanceof FatalError || error instanceof RetryableError) {
    throw error;
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

async function meteredScope(
  meter: MeterCtx,
  ref: RunRef,
  _config: GenerationConfig,
  scope: string,
  reservationRef?: string,
): Promise<MeterCtx> {
  // The workflow argument is immutable, while preparation may deliberately
  // sever a stale resume lineage after human revision. Read the durable
  // effective config so every subsequent paid artifact uses the new root.
  const stored = await loadStoredGenerationConfig(ref.dbRunId);
  return {
    ...meter,
    billingScope: generationBillingScope(stored, ref.dbRunId, scope),
    reservationRef: reservationRef ?? meter.reservationRef,
  };
}

function contentDigest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function loadManuscriptState(bookId: string): Promise<ManuscriptStateRow[]> {
  return getDb()
    .select({
      id: schema.chapters.id,
      chapterNumber: schema.chapters.chapterNumber,
      title: schema.chapters.title,
      summary: schema.chapters.summary,
      content: schema.chapters.content,
      status: schema.chapters.status,
      wordCount: schema.chapters.wordCount,
    })
    .from(schema.chapters)
    .where(eq(schema.chapters.bookId, bookId));
}

async function loadManuscriptDigest(bookId: string): Promise<string> {
  return manuscriptDigest(await loadManuscriptState(bookId));
}

async function loadStoredGenerationConfig(runId: string): Promise<GenerationConfig> {
  const [run] = await getDb()
    .select({ config: schema.generationRuns.config })
    .from(schema.generationRuns)
    .where(eq(schema.generationRuns.id, runId))
    .limit(1);
  if (!run) throw new FatalError("Generation run not found");
  return run.config as GenerationConfig;
}

async function updateStoredGenerationConfig(
  ref: RunRef,
  update: (current: GenerationConfig) => GenerationConfig,
): Promise<GenerationConfig> {
  const db = getDb();
  // Chapter waves checkpoint concurrently. Optimistic compare-and-swap keeps
  // both updates instead of letting the last read/modify/write silently erase
  // its sibling's durable proof.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await loadStoredGenerationConfig(ref.dbRunId);
    const next = update(current);
    const [stored] = await db
      .update(schema.generationRuns)
      .set({ config: next })
      .where(
        and(
          eq(schema.generationRuns.id, ref.dbRunId),
          eq(schema.generationRuns.projectId, ref.projectId),
          eq(schema.generationRuns.config, current),
          inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
          isNull(schema.generationRuns.cancellationRequestedAt),
        ),
      )
      .returning({ config: schema.generationRuns.config });
    if (stored) return stored.config as GenerationConfig;
    try {
      await throwIfAuthoringCancellationRequested(ref.dbRunId);
    } catch (error) {
      toWorkflowError(error);
    }
  }
  throw new RetryableError("Generation state changed too many times while checkpointing", {
    retryAfter: "1s",
  });
}

/**
 * Serializes every manuscript mutation against cancellation. The same
 * project-scoped advisory lock is held by requestAuthoringRunCancellation, so
 * exactly one side wins: a committed mutation happened before the stop
 * request, or the mutation observes cancellation and writes nothing.
 */
export async function withActiveAuthoringMutation<T>(
  ref: RunRef,
  mutate: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${ref.projectId}, 0)
      )`,
    );
    const [run] = await tx
      .select({
        status: schema.generationRuns.status,
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
    if (run?.cancellationRequestedAt || run?.status === "cancelled") {
      throw new FatalError(AUTHORING_CANCELLATION_MESSAGE);
    }
    if (!run || !["queued", "running", "awaiting_input"].includes(run.status)) {
      throw new FatalError(AUTHORING_RUN_INACTIVE_MESSAGE);
    }
    return mutate(tx);
  });
}

async function updateStoredGenerationConfigInTransaction(
  tx: DbTransaction,
  ref: RunRef,
  update: (current: GenerationConfig) => GenerationConfig,
): Promise<GenerationConfig> {
  const [run] = await tx
    .select({
      config: schema.generationRuns.config,
      status: schema.generationRuns.status,
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
  if (run?.cancellationRequestedAt || run?.status === "cancelled") {
    throw new FatalError(AUTHORING_CANCELLATION_MESSAGE);
  }
  if (!run || !["queued", "running", "awaiting_input"].includes(run.status)) {
    throw new FatalError(AUTHORING_RUN_INACTIVE_MESSAGE);
  }
  const current = run.config as GenerationConfig;
  const next = update(current);
  const [stored] = await tx
    .update(schema.generationRuns)
    .set({ config: next })
    .where(
      and(
        eq(schema.generationRuns.id, ref.dbRunId),
        eq(schema.generationRuns.projectId, ref.projectId),
        eq(schema.generationRuns.userId, ref.userId),
        eq(schema.generationRuns.config, current),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
        isNull(schema.generationRuns.cancellationRequestedAt),
      ),
    )
    .returning({ config: schema.generationRuns.config });
  if (!stored) {
    throw new RetryableError("Generation state changed while committing output", {
      retryAfter: "1s",
    });
  }
  return stored.config as GenerationConfig;
}

async function loadCompatibleRetrySource(
  ref: RunRef,
  config: GenerationConfig,
): Promise<{ id: string; config: GenerationConfig } | null> {
  if (!config.resumeFromRunId) return null;
  const [source] = await getDb()
    .select({
      id: schema.generationRuns.id,
      status: schema.generationRuns.status,
      config: schema.generationRuns.config,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.id, config.resumeFromRunId),
        eq(schema.generationRuns.projectId, ref.projectId),
        eq(schema.generationRuns.userId, ref.userId),
        eq(schema.generationRuns.kind, "full_book"),
      ),
    )
    .limit(1);
  if (!source) return null;
  const sourceConfig = source.config as Partial<GenerationConfig>;
  return retryRunFromSavedWork(config, {
    id: source.id,
    status: source.status,
    config: sourceConfig,
  }) === source.id
    ? { id: source.id, config: sourceConfig as GenerationConfig }
    : null;
}

async function loadPreparedResumeSource(
  ref: RunRef,
  config: GenerationConfig,
): Promise<GenerationConfig | null> {
  const source = await loadCompatibleRetrySource(ref, config);
  if (!source) return null;
  const sourceConfig = source.config;
  return sourceConfig.manuscriptPrepared === true &&
    sourceConfig.stagedConcept &&
    sourceConfig.stagedOutline
    ? sourceConfig
    : null;
}

/**
 * Copies only input-compatible pre-manuscript work into an explicit retry.
 * This runs before any wallet gate, so paid concept/question/outline work and
 * a consumed author decision are observed by the new run instead of repeated.
 * Destructive preparation state, chapter work, and completion checkpoints are
 * deliberately left behind unless `loadPreparedResumeSource` proves the full
 * manuscript boundary.
 */
export async function hydratePreManuscriptRetryStep(
  ref: RunRef,
  config: GenerationConfig,
): Promise<{ inherited: boolean; pendingQuestion: boolean }> {
  "use step";
  const source = await loadCompatibleRetrySource(ref, config);
  if (!source || source.config.manuscriptPrepared === true) {
    return { inherited: false, pendingQuestion: false };
  }

  const sourceConfig = source.config;
  await updateStoredGenerationConfig(ref, (current) => ({
    ...current,
    stagedConcept: current.stagedConcept ?? sourceConfig.stagedConcept,
    stagedOutline: current.stagedOutline ?? sourceConfig.stagedOutline,
    creativeDecisions: {
      ...sourceConfig.creativeDecisions,
      ...current.creativeDecisions,
    },
    work: {
      ...current.work,
      ...(current.work?.conceptExpanded || !sourceConfig.work?.conceptExpanded
        ? {}
        : { conceptExpanded: sourceConfig.work.conceptExpanded }),
      ...(current.work?.outline || !sourceConfig.work?.outline
        ? {}
        : { outline: sourceConfig.work.outline }),
    },
  }));

  if (sourceConfig.creativeDecisions?.afterConcept) {
    return { inherited: true, pendingQuestion: false };
  }
  const pending = await readPendingCreativeQuestion(source.id);
  if (!pending) return { inherited: true, pendingQuestion: false };
  await persistCreativeQuestion({
    runId: ref.dbRunId,
    projectId: ref.projectId,
    question: {
      question: pending.question,
      rationale: pending.rationale,
      options: pending.options,
      recommendedOptionId: pending.recommendedOptionId,
    },
  });
  return { inherited: true, pendingQuestion: true };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function ensureConceptPersisted(
  tx: DbTransaction,
  bookId: string,
  concept: BookConcept,
): Promise<void> {
  const [book] = await tx
    .select({
      title: schema.books.title,
      synopsis: schema.books.synopsis,
      concept: schema.books.concept,
    })
    .from(schema.books)
    .where(eq(schema.books.id, bookId))
    .limit(1);
  // The moderation verdict is run bookkeeping and persistConcept deliberately
  // strips it from the author-owned book JSON.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compare the persisted shape
  const { moderation, ...persistableConcept } = concept;
  const alreadyPersisted =
    book?.title === concept.title &&
    book.synopsis === concept.synopsis &&
    stableJson(book.concept) === stableJson(persistableConcept);

  if (!alreadyPersisted) {
    await persistConcept(bookId, concept, tx);
    return;
  }

  // persistConcept may have committed the book update immediately before a
  // transient failure seeding entities. Complete that idempotent tail here.
  await seedEntities(
    bookId,
    concept.characters.map((character) => ({
      kind: "character" as const,
      name: character.name,
      attrs: {
        role: character.role,
        background: character.description,
        arc: character.arc,
        facts: [character.description, `Arc: ${character.arc}`],
      },
    })),
    tx,
  );
}

async function ensureOutlineChapterRows(
  tx: DbTransaction,
  bookId: string,
  outline: BookOutline,
): Promise<void> {
  if (outline.chapters.length === 0) return;
  await tx
    .insert(schema.chapters)
    .values(
      outline.chapters.map((chapter) => ({
        bookId,
        chapterNumber: chapter.number,
        title: chapter.title,
        summary: chapter.summary,
        status: "planned" as const,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.chapters.bookId, schema.chapters.chapterNumber],
      set: {
        title: sql`excluded.title`,
        summary: sql`excluded.summary`,
        updatedAt: new Date(),
      },
    });
}

async function ensureOutlinePersisted(
  tx: DbTransaction,
  bookId: string,
  outline: BookOutline,
): Promise<void> {
  const [latest] = await tx
    .select({ content: schema.outlines.content })
    .from(schema.outlines)
    .where(eq(schema.outlines.bookId, bookId))
    .orderBy(sql`${schema.outlines.version} desc`)
    .limit(1);
  if (latest && stableJson(latest.content) === stableJson(outline)) {
    // Covers a retry after the outline version committed but before its
    // chapter upsert completed.
    await ensureOutlineChapterRows(tx, bookId, outline);
    return;
  }
  await persistOutline(bookId, outline, tx);
}

async function loadOutlineFingerprint(bookId: string): Promise<string> {
  const [latest] = await getDb()
    .select({
      id: schema.outlines.id,
      version: schema.outlines.version,
      source: schema.outlines.source,
      content: schema.outlines.content,
    })
    .from(schema.outlines)
    .where(eq(schema.outlines.bookId, bookId))
    .orderBy(sql`${schema.outlines.version} desc`)
    .limit(1);
  return outlineStateFingerprint(latest);
}

type RequestedRunStatus = "running" | "awaiting_input" | "completed" | "failed" | "cancelled";

export type MarkRunStatusOutcome =
  | { outcome: "matched"; status: RequestedRunStatus }
  | { outcome: "cancellation_won"; status: "cancelled" }
  | { outcome: "terminal_preserved"; status: RequestedRunStatus | "queued" | null };

export async function markRunStatus(
  ref: RunRef,
  status: RequestedRunStatus,
  error?: string,
  failure?: AuthoringFailureDetails,
): Promise<MarkRunStatusOutcome> {
  "use step";
  const result = await transitionAuthoringRunState({
    runId: ref.dbRunId,
    projectId: ref.projectId,
    userId: ref.userId,
    status,
    error,
    ...(failure?.errorCode ? { errorCode: failure.errorCode } : {}),
    ...(failure?.errorStage ? { errorStage: failure.errorStage } : {}),
    ...(status === "completed" ? { resolveCancellationOnComplete: true } : {}),
  });
  if (status !== "cancelled" && result.status === "cancelled") {
    if (status === "completed") {
      return { outcome: "cancellation_won", status: "cancelled" };
    }
    throw new FatalError(AUTHORING_CANCELLATION_MESSAGE);
  }
  if (result.status !== status) {
    if (status === "failed" || status === "cancelled") {
      return { outcome: "terminal_preserved", status: result.status };
    }
    throw new FatalError("Generation run is no longer active");
  }
  if (status === "failed" && failure?.incidentCategory) {
    const unresolvedMetering = failure.incidentCategory === "unresolved_metering";
    await recordAuthoringIncident({
      runId: ref.dbRunId,
      projectId: ref.projectId,
      category: failure.incidentCategory,
      severity: "critical",
      dedupeKey: unresolvedMetering ? "unresolved-metering" : "settled-output-missing",
      evidence: {
        errorCode:
          failure.errorCode ??
          (unresolvedMetering ? "metering_reconciliation_required" : "metered_output_missing"),
        ...(failure.errorStage ? { stage: failure.errorStage } : {}),
      },
    });
  }
  return { outcome: "matched", status };
}

export async function linkWorkflowRunStep(ref: RunRef, workflowRunId: string) {
  "use step";
  return linkAuthoringRunWorkflow({
    runId: ref.dbRunId,
    projectId: ref.projectId,
    userId: ref.userId,
    workflowRunId,
  });
}

export async function allocateAuthoringPauseStep(
  ref: RunRef,
  kind: AuthoringRunInputKind,
  details?: AuthoringPauseDetails,
) {
  "use step";
  const { stepId } = getStepMetadata();
  return allocateAuthoringPause({
    runId: ref.dbRunId,
    projectId: ref.projectId,
    userId: ref.userId,
    kind,
    pauseKey: stepId,
    details,
  });
}

export async function markAuthoringPauseRegisteredStep(
  ref: RunRef,
  kind: AuthoringRunInputKind,
  pauseVersion: number,
) {
  "use step";
  const registered = await markAuthoringPauseRegistered({
    runId: ref.dbRunId,
    projectId: ref.projectId,
    userId: ref.userId,
    kind,
    pauseVersion,
  });
  if (!registered) {
    await throwIfAuthoringCancellationRequested(ref.dbRunId);
    throw new FatalError("Generation run is no longer active");
  }
}

export async function consumeAuthoringRunInputStep(
  ref: RunRef,
  kind: AuthoringRunInputKind,
  pauseVersion: number,
  inputId: string,
) {
  "use step";
  return consumeAuthoringRunInput({
    runId: ref.dbRunId,
    kind,
    pauseVersion,
    inputId,
  });
}

export async function clearAuthoringPauseStep(
  ref: RunRef,
  kind: AuthoringRunInputKind,
  pauseVersion: number,
) {
  "use step";
  await clearAuthoringPause({
    runId: ref.dbRunId,
    kind,
    pauseVersion,
  });
}

/**
 * Opening wallet gate. Fresh runs keep the established estimate exactly.
 * Compatible prepared retries inspect source provenance before asking for
 * money, so reused concept/outline/Bible/chapters/tail work costs zero here.
 */
export async function openingCreditCheckStep(
  ref: RunRef,
  config: GenerationConfig,
): Promise<{ balance: number; required: number; sufficient: boolean }> {
  "use step";
  const source = await loadPreparedResumeSource(ref, config);
  let requiredUsd: number;

  if (!source) {
    requiredUsd = freshOpeningRequiredUsd(config);
  } else {
    const { book } = await loadRunContext(ref);
    const rows = await getDb()
      .select({
        id: schema.chapters.id,
        chapterNumber: schema.chapters.chapterNumber,
        title: schema.chapters.title,
        summary: schema.chapters.summary,
        status: schema.chapters.status,
        content: schema.chapters.content,
        wordCount: schema.chapters.wordCount,
        qualityScore: schema.chapters.qualityScore,
      })
      .from(schema.chapters)
      .where(eq(schema.chapters.bookId, book.id));
    const currentManuscriptDigest = manuscriptDigest(rows);
    const byNumber = new Map(rows.map((row) => [row.chapterNumber, row]));
    const meteredChapters: ResumeChapterMeteredWork[] = [];
    const reportCheckpoint = source.completion?.continuityReport;
    const report =
      reportCheckpoint?.manuscriptDigest === currentManuscriptDigest
        ? reportCheckpoint.report
        : undefined;
    const revisionTargets =
      report && config.tier !== "draft" && report.score < 0.7
        ? new Set(report.worstChapters.slice(0, 3))
        : new Set<number>();

    for (const outlineChapter of source.stagedOutline?.chapters ?? []) {
      const chapterNumber = outlineChapter.number;
      const key = String(chapterNumber);
      const chapter = byNumber.get(chapterNumber);
      const digest = chapter ? contentDigest(chapter.content) : null;
      const writerWork = source.work?.chapters?.[key];
      const revisionCheckpoint = source.completion?.revisionChapters?.[key];
      const editedCheckpoint = source.completion?.editedChapters?.[key];
      const downstreamCheckpoint =
        revisionCheckpoint?.contentDigest === digest
          ? revisionCheckpoint
          : editedCheckpoint?.contentDigest === digest
            ? editedCheckpoint
            : undefined;
      const proseComplete = isChapterComplete(chapter);

      let writer: ResumeChapterMeteredWork["writer"] = "none";
      if (!proseComplete && !writerWork?.result) {
        if (writerWork?.draft) {
          if (config.tier !== "draft") {
            const critique = writerWork.critique;
            writer =
              critique &&
              (critique.verdict === "pass" ||
                !critique.issues.some((issue) => issue.severity === "major"))
                ? "none"
                : "critique";
          }
        } else {
          writer = "full";
        }
      }

      const effectiveContent =
        chapter?.content ||
        writerWork?.result?.content ||
        (config.tier === "draft" ? writerWork?.draft : undefined);
      const effectiveDigest = effectiveContent ? contentDigest(effectiveContent) : null;
      const summaryMeteredComplete =
        source.completion?.chapterSummaries?.[key]?.contentDigest === effectiveDigest ||
        source.work?.chapters?.[key]?.summary?.contentDigest === effectiveDigest ||
        downstreamCheckpoint?.contentDigest === effectiveDigest;
      const summary = !summaryMeteredComplete;

      let editorial: ResumeChapterMeteredWork["editorial"] = "none";
      if (config.tier !== "draft" && !downstreamCheckpoint) {
        const cachedEdit = source.work?.edits?.[`editorial:${chapterNumber}`];
        const cachedEditMatches = digest !== null && cachedEdit?.baseContentDigest === digest;
        if (!cachedEditMatches) {
          if (!proseComplete) {
            editorial = config.tier === "premium" ? "full" : "expected";
          } else if (
            config.tier === "premium" ||
            (chapter?.qualityScore !== null &&
              chapter?.qualityScore !== undefined &&
              Number(chapter.qualityScore) < 0.7)
          ) {
            editorial = "full";
          }
        }
      }

      let revision = false;
      if (revisionTargets.has(chapterNumber)) {
        const cachedRevision = source.work?.edits?.[`revision:${chapterNumber}`];
        revision =
          !(
            revisionCheckpoint?.contentDigest === digest &&
            revisionCheckpoint.reviewManuscriptDigest === currentManuscriptDigest
          ) && !(digest !== null && cachedRevision?.baseContentDigest === digest);
      }

      if (writer !== "none" || summary || editorial !== "none" || revision) {
        meteredChapters.push({ chapterNumber, writer, summary, editorial, revision });
      }
    }

    const phaseKeys = continuityPhaseKeys(config.tier);
    const continuityPhasesRemaining = report
      ? 0
      : phaseKeys.filter(
          (phaseKey) =>
            source.completion?.continuityOutcomes?.[phaseKey]?.manuscriptDigest !==
            currentManuscriptDigest,
        ).length;
    requiredUsd = resumeOpeningRequiredUsd(config, {
      entityBible: !source.completion?.entityBible,
      chapters: meteredChapters,
      continuityPhasesRemaining,
      continuityPhasesTotal: phaseKeys.length,
    });
  }

  const required = canonicalizeCreditRequirement(creditsForUsd(requiredUsd));
  const balance = await getBalance(ref.userId);
  return { balance, required, sufficient: required <= 0 || balance >= required };
}

/** Protocol-v3 concept/question authorization. It never survives a human pause. */
export async function creativeOpeningCreditCheckStep(
  ref: RunRef,
  config: GenerationConfig,
): Promise<{ balance: number; required: number; sufficient: boolean }> {
  "use step";
  const [stored, source, existingQuestion] = await Promise.all([
    loadStoredGenerationConfig(ref.dbRunId),
    loadPreparedResumeSource(ref, config),
    readPendingCreativeQuestion(ref.dbRunId),
  ]);
  const conceptReady = Boolean(stored.stagedConcept ?? source?.stagedConcept);
  const guidanceEnabled =
    config.protocolVersion === 3 &&
    config.interaction?.mode === "guided" &&
    config.interaction.maxQuestions === 1;
  const questionReady = Boolean(
    !guidanceEnabled ||
    stored.creativeDecisions?.afterConcept ||
    source?.stagedOutline ||
    existingQuestion,
  );
  const requiredUsd =
    (conceptReady ? 0 : conceptRequiredUsd(config)) +
    (questionReady ? 0 : creativeQuestionRequiredUsd(config));
  return checkWalletForUsd(ref, requiredUsd);
}

/** Re-authorizes outline work only after the v3 decision pause has closed. */
export async function initialOutlineCreditCheckStep(
  ref: RunRef,
  config: GenerationConfig,
): Promise<{ balance: number; required: number; sufficient: boolean }> {
  "use step";
  const [stored, source] = await Promise.all([
    loadStoredGenerationConfig(ref.dbRunId),
    loadPreparedResumeSource(ref, config),
  ]);
  return checkWalletForUsd(
    ref,
    stored.stagedOutline || source?.stagedOutline ? 0 : initialOutlineRequiredUsd(config),
  );
}

type CreditCheck = { balance: number; required: number; sufficient: boolean };

export type CreditAuthorization = CreditCheck & { reservationRef?: string };

export async function reserveCreditsStep(
  ref: RunRef,
  required: number,
  reservationKey: string,
): Promise<CreditAuthorization> {
  "use step";
  if (required <= 0) {
    return {
      balance: await getBalance(ref.userId),
      required: 0,
      sufficient: true,
    };
  }
  const externalRef = `generation-reservation:${ref.dbRunId}:${reservationKey}`;
  const result = await reserveCredits({
    userId: ref.userId,
    credits: required,
    externalRef,
    description: `Reserve credits for ${reservationKey}`,
    projectId: ref.projectId,
    runId: ref.dbRunId,
  });
  return {
    balance: result.balance,
    required,
    sufficient: result.status !== "insufficient",
    ...(result.status !== "insufficient" ? { reservationRef: externalRef } : {}),
  };
}

export async function releaseCreditsStep(
  ref: RunRef,
  reservationRef: string | undefined,
): Promise<void> {
  "use step";
  if (!reservationRef) return;
  await releaseCreditReservation({
    userId: ref.userId,
    externalRef: reservationRef,
    projectId: ref.projectId,
    runId: ref.dbRunId,
  });
}

/**
 * A human-rejected resumed outline is new paid work owned by this run.
 *
 * This checkpoint must happen before the revision authorization and provider
 * call. Waiting until manuscript preparation would let the revision reuse the
 * source run's billing keys when the author supplied identical notes twice.
 */
export async function severResumeBillingLineageStep(ref: RunRef): Promise<void> {
  "use step";
  await updateStoredGenerationConfig(ref, (current) =>
    severResumeBillingLineage(current, ref.dbRunId),
  );
}

async function checkWalletForUsd(ref: RunRef, requiredUsd: number): Promise<CreditCheck> {
  const required = canonicalizeCreditRequirement(creditsForUsd(requiredUsd));
  const balance = await getBalance(ref.userId);
  // A fully checkpointed retry has no new metered work. It must be allowed to
  // finish DB-only bookkeeping even if an earlier wave left the wallet below 0.
  return { balance, required, sufficient: required <= 0 || balance >= required };
}

type ChapterCostRow = {
  chapterNumber: number;
  status: "planned" | "drafting" | "drafted" | "edited" | "final";
  content: string;
  wordCount: number;
  qualityScore: string | null;
};

function pendingWriterWork(
  config: GenerationConfig,
  stored: GenerationConfig,
  rows: ChapterCostRow[],
  chapterNumbers: number[],
): ResumeChapterMeteredWork[] {
  const byNumber = new Map(rows.map((row) => [row.chapterNumber, row]));
  return chapterNumbers.flatMap((chapterNumber) => {
    const key = String(chapterNumber);
    const chapter = byNumber.get(chapterNumber);
    const digest = chapter ? contentDigest(chapter.content) : null;
    const writerWork = stored.work?.chapters?.[key];
    const downstream = [
      stored.completion?.revisionChapters?.[key],
      stored.completion?.editedChapters?.[key],
    ].find((checkpoint) => checkpoint?.contentDigest === digest);
    const proseComplete = isChapterComplete(chapter);

    let writer: ResumeChapterMeteredWork["writer"] = "none";
    if (!proseComplete && !writerWork?.result) {
      if (!writerWork?.draft) {
        writer = "full";
      } else if (config.tier !== "draft") {
        const critique = writerWork.critique;
        writer =
          critique &&
          (critique.verdict === "pass" ||
            !critique.issues.some((issue) => issue.severity === "major"))
            ? "none"
            : "critique";
      }
    }

    const effectiveContent =
      chapter?.content ||
      writerWork?.result?.content ||
      (config.tier === "draft" ? writerWork?.draft : undefined);
    const effectiveDigest = effectiveContent ? contentDigest(effectiveContent) : null;
    const summary =
      writer !== "none" ||
      (effectiveDigest !== null &&
        stored.completion?.chapterSummaries?.[key]?.contentDigest !== effectiveDigest &&
        stored.work?.chapters?.[key]?.summary?.contentDigest !== effectiveDigest &&
        downstream?.contentDigest !== effectiveDigest);

    return writer !== "none" || summary
      ? [{ chapterNumber, writer, summary, editorial: "none", revision: false }]
      : [];
  });
}

async function loadChapterCostContext(ref: RunRef, chapterNumbers: number[]) {
  const { book } = await loadRunContext(ref);
  const [stored, rows] = await Promise.all([
    loadStoredGenerationConfig(ref.dbRunId),
    chapterNumbers.length === 0
      ? Promise.resolve([])
      : getDb()
          .select({
            chapterNumber: schema.chapters.chapterNumber,
            status: schema.chapters.status,
            content: schema.chapters.content,
            wordCount: schema.chapters.wordCount,
            qualityScore: schema.chapters.qualityScore,
          })
          .from(schema.chapters)
          .where(
            and(
              eq(schema.chapters.bookId, book.id),
              inArray(schema.chapters.chapterNumber, chapterNumbers),
            ),
          ),
  ]);
  return { book, stored, rows };
}

/** Exact pending writer/summary artifacts for one wave; no deferred editing. */
export async function chapterWaveCreditCheckStep(
  ref: RunRef,
  config: GenerationConfig,
  chapterNumbers: number[],
): Promise<CreditCheck> {
  "use step";
  const { stored, rows } = await loadChapterCostContext(ref, chapterNumbers);
  return checkWalletForUsd(
    ref,
    chapterWaveRequiredUsd(config, pendingWriterWork(config, stored, rows, chapterNumbers)),
  );
}

/** Just-in-time editorial/revision gate; cached or already-applied output costs zero. */
export async function editorialWaveCreditCheckStep(
  ref: RunRef,
  config: GenerationConfig,
  chapterNumbers: number[],
  mode: "editorial" | "revision",
): Promise<CreditCheck> {
  "use step";
  const { stored, rows } = await loadChapterCostContext(ref, chapterNumbers);
  const byNumber = new Map(rows.map((row) => [row.chapterNumber, row]));
  const reviewDigest = stored.completion?.continuityReport?.manuscriptDigest;
  const work = chapterNumbers.flatMap((chapterNumber): ResumeChapterMeteredWork[] => {
    const chapter = byNumber.get(chapterNumber);
    if (!chapter?.content) return [];
    const digest = contentDigest(chapter.content);
    const key = String(chapterNumber);
    const completion =
      mode === "revision"
        ? stored.completion?.revisionChapters?.[key]
        : stored.completion?.editedChapters?.[key];
    const downstream =
      mode === "editorial" ? stored.completion?.revisionChapters?.[key] : undefined;
    const completed =
      completion?.contentDigest === digest &&
      (mode !== "revision" ||
        (reviewDigest !== undefined && completion.reviewManuscriptDigest === reviewDigest));
    if (completed || downstream?.contentDigest === digest) return [];

    const cached = stored.work?.edits?.[`${mode}:${chapterNumber}`];
    if (
      cached &&
      (cached.baseContentDigest === digest ||
        cachedEditOutputAlreadyApplied(chapter.content, cached))
    ) {
      return [];
    }
    return [
      {
        chapterNumber,
        writer: "none",
        summary: false,
        editorial: mode === "editorial" ? "full" : "none",
        revision: mode === "revision",
      },
    ];
  });
  return checkWalletForUsd(ref, editorialWaveRequiredUsd(config, work, mode));
}

export async function entityBibleCreditCheckStep(
  ref: RunRef,
  config: GenerationConfig,
): Promise<CreditCheck> {
  "use step";
  const stored = await loadStoredGenerationConfig(ref.dbRunId);
  const source = await loadPreparedResumeSource(ref, config);
  const inheritedBibleComplete =
    source && stagedArtifactsMatch(stored, source) && source.completion?.entityBible !== undefined;
  return checkWalletForUsd(
    ref,
    stored.completion?.entityBible || inheritedBibleComplete ? 0 : entityBibleRequiredUsd(config),
  );
}

export async function continuityCreditCheckStep(
  ref: RunRef,
  config: GenerationConfig,
  phaseKey: ReviewPhaseKey,
): Promise<CreditCheck> {
  "use step";
  const { book } = await loadRunContext(ref);
  const [stored, currentDigest] = await Promise.all([
    loadStoredGenerationConfig(ref.dbRunId),
    loadManuscriptDigest(book.id),
  ]);
  const complete =
    stored.completion?.continuityOutcomes?.[phaseKey]?.manuscriptDigest === currentDigest;
  return checkWalletForUsd(ref, complete ? 0 : continuityPhaseRequiredUsd(config));
}

export async function outlineRevisionCreditCheckStep(
  ref: RunRef,
  config: GenerationConfig,
  revisionNotes: string,
): Promise<CreditCheck> {
  "use step";
  const stored = await loadStoredGenerationConfig(ref.dbRunId);
  const complete =
    stored.work?.outline?.revisionNotes === revisionNotes &&
    stored.work.outline.final !== undefined;
  return checkWalletForUsd(ref, complete ? 0 : outlineRevisionRequiredUsd(config));
}

async function resetManuscriptForPreparation(
  ref: RunRef,
  config: GenerationConfig,
  bookId: string,
): Promise<{ archived: number; reset: number }> {
  return withActiveAuthoringMutation(ref, async (tx) => {
    const chapters = await tx
      .select({
        id: schema.chapters.id,
        chapterNumber: schema.chapters.chapterNumber,
        title: schema.chapters.title,
        summary: schema.chapters.summary,
        content: schema.chapters.content,
        wordCount: schema.chapters.wordCount,
        qualityScore: schema.chapters.qualityScore,
        status: schema.chapters.status,
        version: schema.chapters.version,
      })
      .from(schema.chapters)
      .where(eq(schema.chapters.bookId, bookId));

    let archived = 0;
    let reset = 0;
    for (const chapter of chapters) {
      const shouldSoftRetire = chapter.chapterNumber > config.targetChapters;
      const needsSoftRetire =
        shouldSoftRetire && (chapter.title !== null || chapter.summary !== null);
      const hasRecoverableState = chapter.content.length > 0 || needsSoftRetire;
      let contentAlreadyArchived = false;
      if (hasRecoverableState) {
        const [existingArchive] = await tx
          .select({ id: schema.chapterRevisions.id })
          .from(schema.chapterRevisions)
          .where(
            and(
              eq(schema.chapterRevisions.chapterId, chapter.id),
              eq(schema.chapterRevisions.runId, ref.dbRunId),
              sql`${schema.chapterRevisions.source} like 'generation-reset%'`,
              eq(schema.chapterRevisions.content, chapter.content),
            ),
          )
          .limit(1);
        contentAlreadyArchived = Boolean(existingArchive);
      }
      const plan = planFreshRunChapter(chapter, contentAlreadyArchived);
      if (!plan.reset && !needsSoftRetire) continue;

      if (shouldArchiveGenerationReset(chapter, shouldSoftRetire, contentAlreadyArchived)) {
        await tx.insert(schema.chapterRevisions).values({
          chapterId: chapter.id,
          content: chapter.content,
          source: generationResetSource({
            title: chapter.title,
            summary: chapter.summary,
            status: chapter.status,
          }),
          runId: ref.dbRunId,
        });
        archived += 1;
      }

      const [updated] = await tx
        .update(schema.chapters)
        .set({
          content: "",
          wordCount: 0,
          qualityScore: null,
          status: "planned",
          ...(shouldSoftRetire ? { title: null, summary: null } : {}),
          version: sql`${schema.chapters.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(schema.chapters.id, chapter.id), eq(schema.chapters.version, chapter.version)),
        )
        .returning({ id: schema.chapters.id });
      if (!updated) {
        throw new RetryableError("A chapter changed while the new run was preparing it", {
          retryAfter: "1s",
        });
      }
      reset += 1;
    }

    await updateStoredGenerationConfigInTransaction(tx, ref, (current) => ({
      ...current,
      preparation: { ...current.preparation, manuscriptReset: true },
    }));
    return { archived, reset };
  });
}

/**
 * Retires the prior story bible before a fresh concept is persisted.
 *
 * The snapshot lives on the generation run, so an operator can recover the
 * exact old canon, portraits, and relationship graph. Snapshot, relationship
 * deletion, entity deletion, and the preparation checkpoint commit atomically
 * under the same lock used by cancellation.
 */
async function resetEntityCanonForPreparation(ref: RunRef, bookId: string): Promise<void> {
  await withActiveAuthoringMutation(ref, async (tx) => {
    const [run] = await tx
      .select({ config: schema.generationRuns.config })
      .from(schema.generationRuns)
      .where(eq(schema.generationRuns.id, ref.dbRunId))
      .limit(1);
    if (!run) throw new FatalError("Generation run not found");
    const stored = run.config as GenerationConfig;
    let retiredEntityCanon = stored.retiredEntityCanon;

    if (!retiredEntityCanon) {
      const entities = await tx
        .select({
          id: schema.entities.id,
          kind: schema.entities.kind,
          name: schema.entities.name,
          aliases: schema.entities.aliases,
          attrs: schema.entities.attrs,
          portraitAssetId: schema.entities.portraitAssetId,
          firstAppearanceChapter: schema.entities.firstAppearanceChapter,
          lastUpdatedChapter: schema.entities.lastUpdatedChapter,
        })
        .from(schema.entities)
        .where(eq(schema.entities.bookId, bookId));
      const relationships = await tx
        .select({
          id: schema.entityRelationships.id,
          fromEntityId: schema.entityRelationships.fromEntityId,
          toEntityId: schema.entityRelationships.toEntityId,
          type: schema.entityRelationships.type,
          description: schema.entityRelationships.description,
          establishedChapter: schema.entityRelationships.establishedChapter,
        })
        .from(schema.entityRelationships)
        .where(eq(schema.entityRelationships.bookId, bookId));
      retiredEntityCanon = { entities, relationships };
    }

    await tx
      .delete(schema.entityRelationships)
      .where(eq(schema.entityRelationships.bookId, bookId));
    await tx.delete(schema.entities).where(eq(schema.entities.bookId, bookId));
    await updateStoredGenerationConfigInTransaction(tx, ref, (current) => ({
      ...current,
      retiredEntityCanon: current.retiredEntityCanon ?? retiredEntityCanon,
      preparation: { ...current.preparation, entityCanonReset: true },
    }));
  });
}

/**
 * Commits a run's staged plan at the single durable manuscript boundary.
 *
 * Each logical side effect and its preparation checkpoint share one
 * cancellation-ordered transaction. Retrying after a rollback therefore
 * continues from the first unfinished action without duplicating archives or
 * outline versions.
 */
export async function prepareBookRunStep(
  ref: RunRef,
  config: GenerationConfig,
): Promise<{ mode: "resume" | "fresh"; archived: number; reset: number }> {
  "use step";
  const { book } = await loadRunContext(ref);
  let archived = 0;
  let reset = 0;

  const sourceConfig = await loadPreparedResumeSource(ref, config);
  const currentConfig = await loadStoredGenerationConfig(ref.dbRunId);
  if (sourceConfig && stagedArtifactsMatch(currentConfig, sourceConfig)) {
    await updateStoredGenerationConfig(ref, (current) => ({
      ...current,
      stagedConcept: current.stagedConcept,
      stagedOutline: current.stagedOutline,
      preparation: {
        manuscriptReset: true,
        entityCanonReset: true,
        conceptPersisted: true,
        outlinePersisted: true,
      },
      work: {
        ...sourceConfig.work,
        ...current.work,
        chapters: {
          ...sourceConfig.work?.chapters,
          ...current.work?.chapters,
        },
        edits: {
          ...sourceConfig.work?.edits,
          ...current.work?.edits,
        },
      },
      completion: {
        ...sourceConfig.completion,
        ...current.completion,
        chapterSummaries: {
          ...sourceConfig.completion?.chapterSummaries,
          ...current.completion?.chapterSummaries,
        },
        editedChapters: {
          ...sourceConfig.completion?.editedChapters,
          ...current.completion?.editedChapters,
        },
        revisionChapters: {
          ...sourceConfig.completion?.revisionChapters,
          ...current.completion?.revisionChapters,
        },
        continuityOutcomes: {
          ...sourceConfig.completion?.continuityOutcomes,
          ...current.completion?.continuityOutcomes,
        },
        inheritedFromRunId: sourceConfig.completion?.inheritedFromRunId ?? config.resumeFromRunId,
      },
      manuscriptPrepared: true,
    }));
    return { mode: "resume", archived, reset };
  }
  if (sourceConfig && currentConfig.resumeFromRunId) {
    // Human revision makes this run a new source of truth. Clearing the old
    // resume pointer prevents a later retry from jumping back to the rejected
    // source outline instead of this run's newly approved plan.
    await updateStoredGenerationConfig(ref, (current) => ({
      ...current,
      billingLineageRunId: ref.dbRunId,
      resumeFromRunId: undefined,
      preparation: undefined,
      retiredEntityCanon: undefined,
      work: {
        ...(current.work?.conceptExpanded ? { conceptExpanded: current.work.conceptExpanded } : {}),
        ...(current.work?.outline ? { outline: current.work.outline } : {}),
      },
      completion: undefined,
      manuscriptPrepared: undefined,
    }));
  }

  while (true) {
    const stored = await loadStoredGenerationConfig(ref.dbRunId);
    switch (nextGenerationPreparationAction(stored)) {
      case "reset_manuscript": {
        const result = await resetManuscriptForPreparation(ref, config, book.id);
        archived += result.archived;
        reset += result.reset;
        break;
      }
      case "reset_entity_canon":
        await resetEntityCanonForPreparation(ref, book.id);
        break;
      case "persist_concept": {
        const stagedConcept = conceptSchema.parse(stored.stagedConcept);
        await withActiveAuthoringMutation(ref, async (tx) => {
          await ensureConceptPersisted(tx, book.id, stagedConcept);
          await updateStoredGenerationConfigInTransaction(tx, ref, (current) => ({
            ...current,
            preparation: { ...current.preparation, conceptPersisted: true },
          }));
        });
        break;
      }
      case "persist_outline": {
        const stagedOutline = bookOutlineSchema.parse(stored.stagedOutline);
        await withActiveAuthoringMutation(ref, async (tx) => {
          await ensureOutlinePersisted(tx, book.id, stagedOutline);
          await updateStoredGenerationConfigInTransaction(tx, ref, (current) => ({
            ...current,
            preparation: { ...current.preparation, outlinePersisted: true },
          }));
        });
        break;
      }
      case "mark_prepared": {
        const topology = chapterTopologyFingerprint(await loadManuscriptState(book.id));
        const outlineFingerprint = await loadOutlineFingerprint(book.id);
        await updateStoredGenerationConfig(ref, (current) => ({
          ...current,
          manuscriptPrepared: true,
          chapterTopologyFingerprint: topology,
          liveOutlineFingerprint: outlineFingerprint,
        }));
        return { mode: "fresh", archived, reset };
      }
      case "complete":
        return {
          mode: config.resumeFromRunId ? "resume" : "fresh",
          archived,
          reset,
        };
    }
  }
}

export async function conceptStep(
  ref: RunRef,
  config: GenerationConfig,
  reservationRef?: string,
): Promise<BookConcept> {
  "use step";
  const { book, meter } = await loadRunContext(ref);
  const stored = await loadStoredGenerationConfig(ref.dbRunId);
  if (stored.stagedConcept) {
    return conceptSchema.parse(stored.stagedConcept);
  }
  const source = await loadPreparedResumeSource(ref, config);
  if (source?.stagedConcept) {
    const stagedConcept = conceptSchema.parse(source.stagedConcept);
    await updateStoredGenerationConfig(ref, (current) => ({ ...current, stagedConcept }));
    return stagedConcept;
  }

  const tools: ToolCtx = {
    runId: ref.dbRunId,
    userId: ref.userId,
    projectId: ref.projectId,
    bookId: book.id,
  };
  const contentGuidelines = buildFrozenAuthoringContract(config.inputSnapshot);
  try {
    const concept = await generateConcept(
      {
        meter: await meteredScope(meter, ref, config, "concept", reservationRef),
        tools,
        tier: config.tier,
        brief: config.inputSnapshot.brief,
        workingTitle: config.inputSnapshot.workingTitle,
        genre: config.inputSnapshot.genre ?? undefined,
        contentGuidelines,
      },
      {
        expanded: stored.work?.conceptExpanded,
        onExpanded: async (expanded) => {
          await updateStoredGenerationConfig(ref, (current) => ({
            ...current,
            work: { ...current.work, conceptExpanded: expanded },
          }));
        },
        onRefined: async (refined) => {
          await updateStoredGenerationConfig(ref, (current) => ({
            ...current,
            stagedConcept: refined,
          }));
        },
      },
    );
    return concept;
  } catch (error) {
    toWorkflowError(error);
  }
}

export async function prepareCreativeQuestionStep(
  ref: RunRef,
  config: GenerationConfig,
  concept: BookConcept,
  reservationRef?: string,
): Promise<CreativeQuestionForAuthor | null> {
  "use step";
  if (
    config.protocolVersion !== 3 ||
    config.interaction?.mode !== "guided" ||
    config.interaction.maxQuestions !== 1
  ) {
    return null;
  }
  const stored = await loadStoredGenerationConfig(ref.dbRunId);
  if (stored.creativeDecisions?.afterConcept) return null;
  const source = await loadPreparedResumeSource(ref, config);
  if (source?.stagedOutline) return null;
  const existing = await readPendingCreativeQuestion(ref.dbRunId);
  if (existing) return existing;

  const { meter } = await loadRunContext(ref);
  try {
    const question = await generateCreativeQuestion({
      meter: await meteredScope(
        meter,
        ref,
        config,
        "creative-question:after-concept",
        reservationRef,
      ),
      tier: config.tier,
      concept,
      brief: config.inputSnapshot.brief,
      genre: config.inputSnapshot.genre ?? undefined,
    });
    // No salvageable question. Every early return above is the same outcome —
    // outline straight from the concept — so this joins them instead of
    // throwing: a retry would buy the identical answer.
    if (!question) return null;
    return persistCreativeQuestion({
      runId: ref.dbRunId,
      projectId: ref.projectId,
      question,
    });
  } catch (error) {
    toWorkflowError(error);
  }
}

export async function markCreativeQuestionPauseRegisteredStep(
  ref: RunRef,
  questionId: string,
  pauseVersion: number,
) {
  "use step";
  const registered = await markCreativeQuestionPauseRegistered({
    runId: ref.dbRunId,
    projectId: ref.projectId,
    userId: ref.userId,
    questionId,
    pauseVersion,
  });
  if (!registered) {
    await throwIfAuthoringCancellationRequested(ref.dbRunId);
    throw new FatalError("Generation run is no longer active");
  }
}

export async function consumeCreativeDecisionStep(
  ref: RunRef,
  pauseVersion: number,
  inputId: string,
) {
  "use step";
  return consumeCreativeDecision({
    runId: ref.dbRunId,
    projectId: ref.projectId,
    userId: ref.userId,
    pauseVersion,
    inputId,
  });
}

export async function outlineStep(
  ref: RunRef,
  config: GenerationConfig,
  concept: BookConcept,
  revisionNotes?: string,
  reservationRef?: string,
): Promise<BookOutline> {
  "use step";
  const { book, meter } = await loadRunContext(ref);
  const stored = await loadStoredGenerationConfig(ref.dbRunId);
  const requestedRevisionKey = revisionNotes ?? null;
  if (stored.work?.outline?.revisionNotes === requestedRevisionKey && stored.work.outline.final) {
    return bookOutlineSchema.parse(stored.work.outline.final);
  }
  if (revisionNotes === undefined) {
    if (stored.stagedOutline) {
      return bookOutlineSchema.parse(stored.stagedOutline);
    }
    const source = await loadPreparedResumeSource(ref, config);
    if (source?.stagedOutline) {
      const stagedOutline = bookOutlineSchema.parse(source.stagedOutline);
      await updateStoredGenerationConfig(ref, (current) => ({ ...current, stagedOutline }));
      return stagedOutline;
    }
  }
  const tools: ToolCtx = {
    runId: ref.dbRunId,
    userId: ref.userId,
    projectId: ref.projectId,
    bookId: book.id,
  };
  const contentGuidelines = buildFrozenAuthoringContract(config.inputSnapshot);
  try {
    const revisionKey = revisionNotes ?? null;
    const priorWork =
      stored.work?.outline?.revisionNotes === revisionKey ? stored.work.outline : undefined;
    const checkpoint: OutlineGenerationCheckpoint | undefined = priorWork
      ? {
          plan: priorWork.plan as OutlineGenerationCheckpoint["plan"],
          draft: priorWork.draft,
        }
      : undefined;
    const outline = await generateOutline(
      {
        meter: await meteredScope(
          meter,
          ref,
          config,
          `outline:${contentDigest(revisionNotes ?? "initial").slice(0, 16)}`,
          reservationRef,
        ),
        tools,
        tier: config.tier,
        concept,
        workingTitle: config.inputSnapshot.workingTitle,
        brief: config.inputSnapshot.brief || undefined,
        genre: config.inputSnapshot.genre ?? undefined,
        chapterCount: config.targetChapters,
        targetWordsPerChapter: config.targetWordsPerChapter,
        revisionNotes,
        creativeDirection: creativeDecisionPrompt(stored),
        contentGuidelines,
      },
      {
        checkpoint,
        onCheckpoint: async (next) => {
          await updateStoredGenerationConfig(ref, (current) => ({
            ...current,
            work: {
              ...current.work,
              outline: {
                revisionNotes: revisionKey,
                plan: next.plan,
                draft: next.draft,
              },
            },
          }));
        },
        onFinal: async (final) => {
          await updateStoredGenerationConfig(ref, (current) => ({
            ...current,
            stagedOutline: final,
            work: {
              ...current.work,
              outline: {
                ...current.work?.outline,
                revisionNotes: revisionKey,
                final,
              },
            },
          }));
        },
      },
    );
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
  reservationRef?: string,
): Promise<{ entityCount: number; relationshipCount: number }> {
  "use step";
  const { book, meter } = await loadRunContext(ref);
  const stored = await loadStoredGenerationConfig(ref.dbRunId);
  if (stored.completion?.entityBible) {
    return {
      entityCount: stored.completion.entityBible.entityCount,
      relationshipCount: stored.completion.entityBible.relationshipCount,
    };
  }
  try {
    const existing = await listEntities(book.id);
    const bible = await generateEntityBible({
      meter: await meteredScope(meter, ref, config, "entity-bible", reservationRef),
      bookId: book.id,
      tier: config.tier,
      concept,
      outline,
      genre: config.inputSnapshot.genre ?? undefined,
      authoringContract: buildFrozenAuthoringContract(config.inputSnapshot),
      existingNames: existing.map((e) => e.name),
    });
    const result = await withActiveAuthoringMutation(ref, async (tx) => {
      const persisted = await persistEntityBible(book.id, bible, tx);
      await updateStoredGenerationConfigInTransaction(tx, ref, (current) => ({
        ...current,
        completion: {
          ...current.completion,
          entityBible: { sourceRunId: ref.dbRunId, ...persisted },
        },
      }));
      return persisted;
    });
    return result;
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
  await withActiveAuthoringMutation(ref, async (tx) => {
    const [chapter] = await tx
      .select({
        id: schema.chapters.id,
        content: schema.chapters.content,
        version: schema.chapters.version,
      })
      .from(schema.chapters)
      .where(
        and(eq(schema.chapters.bookId, book.id), eq(schema.chapters.chapterNumber, chapterNumber)),
      )
      .limit(1);
    if (!chapter) return;

    if (chapter.content.trim().length > 0) {
      const [archive] = await tx
        .select({ id: schema.chapterRevisions.id })
        .from(schema.chapterRevisions)
        .where(
          and(
            eq(schema.chapterRevisions.chapterId, chapter.id),
            eq(schema.chapterRevisions.runId, ref.dbRunId),
            eq(schema.chapterRevisions.source, "regenerate"),
            eq(schema.chapterRevisions.content, chapter.content),
          ),
        )
        .limit(1);
      if (!archive) {
        await tx.insert(schema.chapterRevisions).values({
          chapterId: chapter.id,
          content: chapter.content,
          source: "regenerate",
          runId: ref.dbRunId,
        });
      }
    }
    const [updated] = await tx
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
      .where(and(eq(schema.chapters.id, chapter.id), eq(schema.chapters.version, chapter.version)))
      .returning({ id: schema.chapters.id });
    if (!updated) {
      throw new RetryableError("Chapter changed while regeneration was preparing it", {
        retryAfter: "1s",
      });
    }
  });
}

async function ensureChapterPostWrite(
  ref: RunRef,
  config: GenerationConfig,
  input: {
    meter: MeterCtx;
    bookId: string;
    chapterNumber: number;
    chapterTitle: string | null;
    content: string;
  },
): Promise<void> {
  const key = String(input.chapterNumber);
  const digest = contentDigest(input.content);
  let stored = await loadStoredGenerationConfig(ref.dbRunId);
  if (stored.completion?.chapterSummaries?.[key]?.contentDigest === digest) {
    return;
  }

  const summaryInput = {
    meter: await meteredScope(
      input.meter,
      ref,
      config,
      `chapter:${input.chapterNumber}:summary:${digest.slice(0, 16)}`,
    ),
    bookId: input.bookId,
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle,
    content: input.content,
    tier: config.tier,
  };
  let summaryCheckpoint = stored.work?.chapters?.[key]?.summary;
  if (!summaryCheckpoint || summaryCheckpoint.contentDigest !== digest) {
    const summary = await generateChapterSummary(summaryInput);
    summaryCheckpoint = { contentDigest: digest, result: summary };
    stored = await updateStoredGenerationConfig(ref, (current) => ({
      ...current,
      work: {
        ...current.work,
        chapters: {
          ...current.work?.chapters,
          [key]: {
            ...current.work?.chapters?.[key],
            summary: summaryCheckpoint,
          },
        },
      },
    }));
    summaryCheckpoint = stored.work?.chapters?.[key]?.summary ?? summaryCheckpoint;
  }

  await withActiveAuthoringMutation(ref, async (tx) => {
    await persistChapterSummary(summaryInput, summaryCheckpoint.result, tx);
    await updateStoredGenerationConfigInTransaction(tx, ref, (current) => ({
      ...current,
      completion: {
        ...current.completion,
        chapterSummaries: {
          ...current.completion?.chapterSummaries,
          [key]: { sourceRunId: ref.dbRunId, contentDigest: digest },
        },
      },
    }));
  });
}

export function resolvedChapterTargetWords(
  config: Pick<GenerationConfig, "chapterRegeneration" | "targetWordsPerChapter">,
  outlineTargetWords: number | undefined,
): number {
  return config.chapterRegeneration
    ? config.targetWordsPerChapter
    : (outlineTargetWords ?? config.targetWordsPerChapter);
}

/**
 * Returns only chapters that still need a metered writer or post-write upkeep.
 * The workflow uses this exact list for the next-wave credit requirement.
 */
export async function chapterNumbersNeedingWorkStep(
  ref: RunRef,
  chapterNumbers: number[],
): Promise<number[]> {
  "use step";
  if (chapterNumbers.length === 0) return [];
  const { book } = await loadRunContext(ref);
  const [rows, stored] = await Promise.all([
    getDb()
      .select({
        chapterNumber: schema.chapters.chapterNumber,
        status: schema.chapters.status,
        content: schema.chapters.content,
        wordCount: schema.chapters.wordCount,
        qualityScore: schema.chapters.qualityScore,
      })
      .from(schema.chapters)
      .where(
        and(
          eq(schema.chapters.bookId, book.id),
          inArray(schema.chapters.chapterNumber, chapterNumbers),
        ),
      ),
    loadStoredGenerationConfig(ref.dbRunId),
  ]);
  const byNumber = new Map(rows.map((row) => [row.chapterNumber, row]));
  return chapterNumbers.filter((chapterNumber) => {
    const chapter = byNumber.get(chapterNumber);
    const digest = chapter ? contentDigest(chapter.content) : null;
    const key = String(chapterNumber);
    const downstream =
      stored.completion?.revisionChapters?.[key] ?? stored.completion?.editedChapters?.[key];
    return !isChapterProductionComplete(
      chapter,
      stored.completion?.chapterSummaries?.[key],
      digest,
      downstream,
    );
  });
}

export async function writeChapterStep(
  ref: RunRef,
  config: GenerationConfig,
  chapterNumber: number,
  reservationRef?: string,
): Promise<{ chapterNumber: number; wordCount: number; qualityScore: number }> {
  "use step";
  const { book, meter } = await loadRunContext(ref);
  const db = getDb();
  const { attempt } = getStepMetadata();

  // Resume: a retry run reuses chapters a prior run already finished.
  const [existing] = await db
    .select({
      id: schema.chapters.id,
      status: schema.chapters.status,
      title: schema.chapters.title,
      content: schema.chapters.content,
      summary: schema.chapters.summary,
      wordCount: schema.chapters.wordCount,
      qualityScore: schema.chapters.qualityScore,
      version: schema.chapters.version,
    })
    .from(schema.chapters)
    .where(
      and(eq(schema.chapters.bookId, book.id), eq(schema.chapters.chapterNumber, chapterNumber)),
    )
    .limit(1);
  if (isChapterComplete(existing)) {
    // An outline summary is not proof that canon/moderation upkeep ran. The
    // digest-bound checkpoint is the only completion signal.
    try {
      await ensureChapterPostWrite(ref, config, {
        meter: { ...meter, reservationRef },
        bookId: book.id,
        chapterNumber,
        chapterTitle: existing.title,
        content: existing.content,
      });
    } catch (error) {
      toWorkflowError(error);
    }
    await persistAndPublishProgress(
      ref,
      {
        type: "chapter",
        chapterNumber,
        status: existing.status as "drafted" | "edited" | "final",
        wordCount: existing.wordCount,
        qualityScore: existing.qualityScore ? Number(existing.qualityScore) : undefined,
      },
      `chapter:${chapterNumber}:${existing.status}`,
    );
    return {
      chapterNumber,
      wordCount: existing.wordCount,
      qualityScore: existing.qualityScore ? Number(existing.qualityScore) : 0.75,
    };
  }
  if (!existing) throw new FatalError(`Chapter ${chapterNumber} was not prepared`);

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
      targetWords: config.targetWordsPerChapter,
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

  const claimed = await withActiveAuthoringMutation(ref, async (tx) => {
    const [row] = await tx
      .update(schema.chapters)
      .set({
        status: "drafting",
        version: sql`${schema.chapters.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(schema.chapters.id, existing.id), eq(schema.chapters.version, existing.version)),
      )
      .returning({ version: schema.chapters.version });
    return row;
  });
  if (!claimed) {
    throw new RetryableError("Chapter changed while generation was claiming it", {
      retryAfter: "1s",
    });
  }
  await persistAndPublishProgress(
    ref,
    { type: "chapter", chapterNumber, status: "drafting" },
    `chapter:${chapterNumber}:drafting`,
  );

  const proseWriter = getWritable<string>({ namespace: chapterNs(chapterNumber) }).getWriter();
  try {
    const checkpointKey = String(chapterNumber);
    const checkpoint = (await loadStoredGenerationConfig(ref.dbRunId)).work?.chapters?.[
      checkpointKey
    ];
    const scopedMeter = await meteredScope(
      meter,
      ref,
      config,
      `chapter:${chapterNumber}:writer`,
      reservationRef,
    );
    const result = await writeChapter(
      {
        meter: scopedMeter,
        tools: {
          runId: ref.dbRunId,
          userId: ref.userId,
          projectId: ref.projectId,
          bookId: book.id,
          chapterNumber,
          mutationScope: `chapter:${chapterNumber}:writer`,
        },
        tier: config.tier,
        chapterNumber,
        totalChapters: config.targetChapters,
        chapterOutline,
        prevSummaries: prevSummaries.slice(-4),
        genre: config.inputSnapshot.genre ?? undefined,
        styleGuide: config.inputSnapshot.styleGuide ?? undefined,
        voiceProfile: config.inputSnapshot.voiceProfile ?? undefined,
        contentGuidelines: buildFrozenAuthoringContract(config.inputSnapshot),
        plotStructure: outline.plotStructure,
        targetWords: resolvedChapterTargetWords(config, chapterOutline.targetWords),
        // Retrying a failed stream must not append the same prefix to the
        // durable UI namespace twice. Later attempts finish silently, then the
        // chapter status event replaces the partial view with persisted prose.
        onProseDelta:
          attempt === 1
            ? async (delta) => {
                await proseWriter.write(delta);
              }
            : undefined,
      },
      {
        checkpoint,
        onCheckpoint: async (next) => {
          await updateStoredGenerationConfig(ref, (current) => ({
            ...current,
            work: {
              ...current.work,
              chapters: {
                ...current.work?.chapters,
                [checkpointKey]: {
                  ...current.work?.chapters?.[checkpointKey],
                  ...next,
                },
              },
            },
          }));
        },
      },
    );

    const persistedId = await withActiveAuthoringMutation(ref, async (tx) => {
      const [persisted] = await tx
        .update(schema.chapters)
        .set({
          content: result.content,
          wordCount: result.wordCount,
          qualityScore: result.qualityScore.toFixed(3),
          status: "drafted",
          version: sql`${schema.chapters.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.chapters.bookId, book.id),
            eq(schema.chapters.chapterNumber, chapterNumber),
            eq(schema.chapters.version, claimed.version),
          ),
        )
        .returning({ id: schema.chapters.id });
      return persisted?.id;
    });
    if (!persistedId) {
      throw new RetryableError("Chapter changed while generated prose was applying", {
        retryAfter: "1s",
      });
    }
    await ensureChapterPostWrite(ref, config, {
      meter: scopedMeter,
      bookId: book.id,
      chapterNumber,
      chapterTitle: chapterOutline.title,
      content: result.content,
    });

    await persistAndPublishProgress(
      ref,
      {
        type: "chapter",
        chapterNumber,
        status: "drafted",
        wordCount: result.wordCount,
        qualityScore: result.qualityScore,
      },
      `chapter:${chapterNumber}:drafted`,
    );
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
  reservationRef?: string,
): Promise<{ chapterNumber: number; changed: boolean }> {
  "use step";
  const { book, meter } = await loadRunContext(ref);
  const db = getDb();
  const [chapter] = await db
    .select()
    .from(schema.chapters)
    .where(
      and(eq(schema.chapters.bookId, book.id), eq(schema.chapters.chapterNumber, chapterNumber)),
    )
    .limit(1);
  if (!chapter || !chapter.content) return { chapterNumber, changed: false };

  const mode = issueNotes ? "revision" : "editorial";
  const key = `${mode}:${chapterNumber}`;
  const beforeDigest = contentDigest(chapter.content);
  let stored = await loadStoredGenerationConfig(ref.dbRunId);
  const reviewManuscriptDigest =
    mode === "revision" ? stored.completion?.continuityReport?.manuscriptDigest : undefined;
  const completed =
    mode === "revision"
      ? stored.completion?.revisionChapters?.[String(chapterNumber)]
      : stored.completion?.editedChapters?.[String(chapterNumber)];
  const downstreamRevision =
    mode === "editorial" ? stored.completion?.revisionChapters?.[String(chapterNumber)] : undefined;
  const completedMatches =
    completed?.contentDigest === beforeDigest &&
    (mode !== "revision" ||
      (reviewManuscriptDigest !== undefined &&
        completed.reviewManuscriptDigest === reviewManuscriptDigest));
  if (completedMatches || downstreamRevision?.contentDigest === beforeDigest) {
    return {
      chapterNumber,
      changed: completed?.changed ?? downstreamRevision?.changed ?? false,
    };
  }

  try {
    let edited = stored.work?.edits?.[key];
    const cachedOutputAlreadyApplied = cachedEditOutputAlreadyApplied(chapter.content, edited);
    if (!cachedOutputAlreadyApplied && (!edited || edited.baseContentDigest !== beforeDigest)) {
      const result = await editChapter({
        meter: await meteredScope(
          meter,
          ref,
          config,
          `chapter:${chapterNumber}:${mode}:${beforeDigest.slice(0, 16)}${
            reviewManuscriptDigest ? `:${reviewManuscriptDigest.slice(0, 16)}` : ""
          }`,
          reservationRef,
        ),
        tools: {
          runId: ref.dbRunId,
          userId: ref.userId,
          projectId: ref.projectId,
          bookId: book.id,
          chapterNumber,
        },
        tier: config.tier,
        chapterNumber,
        content: chapter.content,
        revisionNotes: issueNotes,
        styleGuide: buildFrozenAuthoringContract(config.inputSnapshot),
      });
      const editResult = { baseContentDigest: beforeDigest, ...result };
      edited = editResult;
      stored = await updateStoredGenerationConfig(ref, (current) => ({
        ...current,
        work: {
          ...current.work,
          edits: { ...current.work?.edits, [key]: editResult },
        },
      }));
      edited = stored.work?.edits?.[key] ?? edited;
    }
    if (!edited) {
      throw new RetryableError("Editorial output was not checkpointed", { retryAfter: "1s" });
    }

    let finalContent = chapter.content;
    if (edited.changed && !cachedOutputAlreadyApplied) {
      const revisionSource = mode === "revision" ? "continuity-revision" : "writer";
      await withActiveAuthoringMutation(ref, async (tx) => {
        const [archive] = await tx
          .select({ id: schema.chapterRevisions.id })
          .from(schema.chapterRevisions)
          .where(
            and(
              eq(schema.chapterRevisions.chapterId, chapter.id),
              eq(schema.chapterRevisions.runId, ref.dbRunId),
              eq(schema.chapterRevisions.source, revisionSource),
              eq(schema.chapterRevisions.content, chapter.content),
            ),
          )
          .limit(1);
        if (!archive) {
          await tx.insert(schema.chapterRevisions).values({
            chapterId: chapter.id,
            content: chapter.content,
            source: revisionSource,
            runId: ref.dbRunId,
          });
        }
        const [updated] = await tx
          .update(schema.chapters)
          .set({
            content: edited.content,
            wordCount: edited.content.split(/\s+/).filter(Boolean).length,
            status: "edited",
            version: chapter.version + 1,
            updatedAt: new Date(),
          })
          .where(
            and(eq(schema.chapters.id, chapter.id), eq(schema.chapters.version, chapter.version)),
          )
          .returning({ content: schema.chapters.content });
        if (updated) return;
        const [current] = await tx
          .select({ content: schema.chapters.content })
          .from(schema.chapters)
          .where(eq(schema.chapters.id, chapter.id))
          .limit(1);
        if (current?.content !== edited.content) {
          throw new RetryableError("Chapter changed while its editorial pass was applying", {
            retryAfter: "1s",
          });
        }
      });
      finalContent = edited.content;
    }

    const checkpoint = {
      sourceRunId: ref.dbRunId,
      contentDigest: contentDigest(finalContent),
      changed: edited.changed,
      ...(mode === "revision" && reviewManuscriptDigest ? { reviewManuscriptDigest } : {}),
    };
    await updateStoredGenerationConfig(ref, (current) => ({
      ...current,
      completion: {
        ...current.completion,
        ...(mode === "revision"
          ? {
              revisionChapters: {
                ...current.completion?.revisionChapters,
                [String(chapterNumber)]: checkpoint,
              },
            }
          : {
              editedChapters: {
                ...current.completion?.editedChapters,
                [String(chapterNumber)]: checkpoint,
              },
            }),
      },
    }));
    await persistAndPublishProgress(
      ref,
      {
        type: "chapter",
        chapterNumber,
        status: "edited",
      },
      `chapter:${chapterNumber}:edited`,
    );
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
  reservationRef?: string,
): Promise<ContinuityOutcome> {
  "use step";
  const { book, meter } = await loadRunContext(ref);
  const currentManuscriptDigest = await loadManuscriptDigest(book.id);
  const stored = await loadStoredGenerationConfig(ref.dbRunId);
  const checkpoint = stored.completion?.continuityOutcomes?.[phaseKey];
  if (checkpoint?.manuscriptDigest === currentManuscriptDigest) return checkpoint.outcome;
  try {
    const outcome = await runContinuityPhase(
      {
        meter: await meteredScope(
          meter,
          ref,
          config,
          `continuity:${phaseKey}:${currentManuscriptDigest.slice(0, 16)}`,
          reservationRef,
        ),
        tools: {
          runId: ref.dbRunId,
          userId: ref.userId,
          projectId: ref.projectId,
          bookId: book.id,
          mutationScope: `continuity:${phaseKey}:${currentManuscriptDigest.slice(0, 16)}`,
        },
        tier: config.tier,
      },
      phaseKey,
    );
    if ((await loadManuscriptDigest(book.id)) !== currentManuscriptDigest) {
      throw new RetryableError("Manuscript changed during continuity review", {
        retryAfter: "1s",
      });
    }
    await updateStoredGenerationConfig(ref, (current) => ({
      ...current,
      completion: {
        ...current.completion,
        continuityOutcomes: {
          ...current.completion?.continuityOutcomes,
          [phaseKey]: {
            sourceRunId: ref.dbRunId,
            manuscriptDigest: currentManuscriptDigest,
            outcome,
          },
        },
      },
    }));
    return outcome;
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
  const currentManuscriptDigest = await loadManuscriptDigest(book.id);
  const stored = await loadStoredGenerationConfig(ref.dbRunId);
  const checkpoint = stored.completion?.continuityReport;
  if (checkpoint?.manuscriptDigest === currentManuscriptDigest) {
    await persistAndPublishProgress(
      ref,
      {
        type: "review",
        score: checkpoint.report.score,
        recommendation: checkpoint.report.recommendation,
        issueCount: checkpoint.report.issues.length,
      },
      "review",
    );
    return checkpoint.report;
  }
  if (
    outcomes.some(
      (outcome) =>
        stored.completion?.continuityOutcomes?.[outcome.key]?.manuscriptDigest !==
        currentManuscriptDigest,
    )
  ) {
    throw new RetryableError("Continuity phases do not match the current manuscript", {
      retryAfter: "1s",
    });
  }
  const report = aggregateContinuityOutcomes(outcomes);
  await withActiveAuthoringMutation(ref, async (tx) => {
    await persistContinuityIssues(book.id, ref.dbRunId, report.issues, tx);
    await updateStoredGenerationConfigInTransaction(tx, ref, (current) => ({
      ...current,
      completion: {
        ...current.completion,
        continuityReport: {
          sourceRunId: ref.dbRunId,
          manuscriptDigest: currentManuscriptDigest,
          report,
        },
      },
    }));
  });
  await persistAndPublishProgress(
    ref,
    {
      type: "review",
      score: report.score,
      recommendation: report.recommendation,
      issueCount: report.issues.length,
    },
    "review",
  );
  return report;
}

/**
 * Terminal boundary for a full-book run.
 *
 * `detail` and `degradations` are both display/provenance inputs: finalization
 * has never needed anything from the review passes, only the manuscript itself.
 * A run whose quality passes were skipped still finalizes, and records which
 * ones were skipped so the author and support can see what they did not get.
 */
export async function finalizeStep(
  ref: RunRef,
  detail?: string,
  degradations: readonly DegradedPass[] = [],
): Promise<void> {
  "use step";
  const { stepId } = getStepMetadata();
  const doneEvent: RunEvent = {
    type: "stage",
    stage: "done",
    pct: 100,
    ...(detail ? { detail } : {}),
  };
  await withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${ref.projectId}, 0)
      )`,
    );
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ref.userId}, 0))`);
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:run-events:' || ${ref.dbRunId}, 0)
      )`,
    );
    const [run] = await tx
      .select({
        status: schema.generationRuns.status,
        config: schema.generationRuns.config,
        nextEventSeq: schema.generationRuns.nextEventSeq,
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
    if (!run) throw new FatalError("Generation run not found");
    const stored = run.config as GenerationConfig;
    if (run.status === "completed" && stored.completion?.finalized?.manuscriptDigest) return;
    if (run.cancellationRequestedAt || run.status === "cancelled") {
      throw new FatalError(AUTHORING_CANCELLATION_MESSAGE);
    }
    if (!["queued", "running", "awaiting_input"].includes(run.status)) {
      throw new FatalError(AUTHORING_RUN_INACTIVE_MESSAGE);
    }

    const [book] = await tx
      .select({ id: schema.books.id })
      .from(schema.books)
      .where(eq(schema.books.projectId, ref.projectId))
      .limit(1);
    if (!book) throw new FatalError("Book not found");
    const beforeRows = await tx
      .select({
        id: schema.chapters.id,
        chapterNumber: schema.chapters.chapterNumber,
        title: schema.chapters.title,
        summary: schema.chapters.summary,
        content: schema.chapters.content,
        status: schema.chapters.status,
        wordCount: schema.chapters.wordCount,
      })
      .from(schema.chapters)
      .where(eq(schema.chapters.bookId, book.id));
    const expected = stored.targetChapters;
    const completeNumbers = new Set(
      beforeRows
        .filter(
          (chapter) =>
            chapter.chapterNumber >= 1 &&
            chapter.chapterNumber <= expected &&
            chapter.wordCount > 0 &&
            chapter.content.trim().length > 0,
        )
        .map((chapter) => chapter.chapterNumber),
    );
    if (completeNumbers.size < expected) {
      throw new FatalError(
        `Cannot finalize: expected ${expected} complete chapters, found ${completeNumbers.size}`,
      );
    }

    await tx
      .update(schema.chapters)
      .set({ status: "final" })
      .where(
        and(
          eq(schema.chapters.bookId, book.id),
          inArray(schema.chapters.status, ["drafted", "edited"]),
        ),
      );
    const finalizedRows = beforeRows.map((chapter) =>
      chapter.status === "drafted" || chapter.status === "edited"
        ? { ...chapter, status: "final" }
        : chapter,
    ) as ManuscriptStateRow[];
    const digest = manuscriptDigest(finalizedRows);
    const now = new Date();
    const config: GenerationConfig = {
      ...stored,
      completion: {
        ...stored.completion,
        finalized: { sourceRunId: ref.dbRunId, manuscriptDigest: digest },
        // Retries replay this step; keep the first record of what was skipped
        // rather than restamping it with a later time.
        ...(degradations.length > 0 && !stored.completion?.degraded
          ? {
              degraded: degradations.map((pass) => ({
                stage: pass.stage,
                code: pass.code,
                reason: pass.reason,
                at: now.toISOString(),
              })),
            }
          : {}),
      },
    };

    const [existingDone] = await tx
      .select({ id: schema.generationEvents.id })
      .from(schema.generationEvents)
      .where(
        and(
          eq(schema.generationEvents.runId, ref.dbRunId),
          eq(schema.generationEvents.eventKey, `${stepId}:done`),
        ),
      )
      .limit(1);
    const allocatedDoneSeq = await nextRunEventSequence(tx, ref.dbRunId, run.nextEventSeq);
    if (!existingDone) {
      await tx.insert(schema.generationEvents).values({
        runId: ref.dbRunId,
        seq: allocatedDoneSeq,
        eventKey: `${stepId}:done`,
        type: "stage",
        payload: doneEvent,
        createdAt: now,
      });
    }
    await tx
      .update(schema.generationRuns)
      .set({
        config,
        status: "completed",
        currentStage: "done",
        progressPct: 100,
        stageDescription: detail ?? null,
        lastProgressAt: now,
        heartbeatAt: now,
        completedAt: now,
        acceptanceUncertainAt: null,
        acceptanceDispatchClaimedAt: null,
        nextEventSeq: existingDone ? allocatedDoneSeq : allocatedDoneSeq + 1,
      })
      .where(eq(schema.generationRuns.id, ref.dbRunId));
    await tx
      .update(schema.projects)
      .set({
        status: "editing",
        completedAt: sql`coalesce(${schema.projects.completedAt}, ${now})`,
        updatedAt: now,
      })
      .where(and(eq(schema.projects.id, ref.projectId), eq(schema.projects.userId, ref.userId)));
    await tx
      .insert(schema.creditLedger)
      .values({
        userId: ref.userId,
        amount: "0",
        kind: "adjustment",
        description: "Close generation reservations after active calls settle",
        projectId: ref.projectId,
        runId: ref.dbRunId,
        externalRef: `reservation-close-request:${ref.dbRunId}`,
      })
      .onConflictDoNothing({ target: schema.creditLedger.externalRef });
  });

  try {
    await writeEvent(PROGRESS_NS, doneEvent);
  } catch (error) {
    console.warn("Could not publish persisted completion event", {
      runId: ref.dbRunId,
      error,
    });
  }

  const db = getDb();
  // Tell the author. Best-effort: a book that finished but could not say so
  // is still a finished book, so email failures never fail the step.
  try {
    const [row] = await db
      .select({
        email: schema.users.email,
        title: schema.books.title,
        chapters: sql<number>`(
          select count(*)::int
          from ${schema.chapters}
          where ${schema.chapters.bookId} = ${schema.books.id}
            and not (
              ${schema.chapters.status} = 'planned'
              and ${schema.chapters.wordCount} = 0
              and ${schema.chapters.title} is null
              and ${schema.chapters.summary} is null
            )
        )`,
        words: sql<number>`(select coalesce(sum(${schema.chapters.wordCount}), 0)::int from ${schema.chapters} where ${schema.chapters.bookId} = ${schema.books.id})`,
      })
      .from(schema.books)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
      .where(eq(schema.projects.id, ref.projectId))
      .limit(1);
    if (row?.email) {
      await sendBookFinishedEmail({
        userId: ref.userId,
        to: row.email,
        bookTitle: row.title,
        projectId: ref.projectId,
        chapterCount: row.chapters,
        wordCount: row.words,
        runId: ref.dbRunId,
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
  pauseVersion?: number,
): Promise<void> {
  "use step";
  try {
    const db = getDb();
    const [row] = await db
      .select({
        email: schema.users.email,
        title: schema.books.title,
        experience: schema.projects.experience,
        supportReference: schema.generationRuns.supportReference,
      })
      .from(schema.books)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
      .innerJoin(schema.generationRuns, eq(schema.generationRuns.id, ref.dbRunId))
      .where(
        and(
          eq(schema.projects.id, ref.projectId),
          eq(schema.generationRuns.projectId, ref.projectId),
        ),
      )
      .limit(1);
    if (row?.email) {
      if (row.experience === "trial_short_story") {
        await sendIncludedStoryPausedEmail({
          userId: ref.userId,
          to: row.email,
          bookTitle: row.title,
          projectId: ref.projectId,
          runId: ref.dbRunId,
          pauseVersion,
          supportReference: row.supportReference,
        });
      } else {
        await sendCreditsPausedEmail({
          userId: ref.userId,
          to: row.email,
          bookTitle: row.title,
          projectId: ref.projectId,
          balance,
          required,
          runId: ref.dbRunId,
          pauseVersion,
        });
      }
    }
  } catch (error) {
    console.warn("[email] credits-paused notification failed:", error);
  }
}

/** Emails one idempotent outline-ready notice after the hook is actionable. */
export async function notifyOutlineApprovalStep(ref: RunRef, pauseVersion: number): Promise<void> {
  "use step";
  try {
    const [row] = await getDb()
      .select({ email: schema.users.email, title: schema.books.title })
      .from(schema.books)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
      .where(eq(schema.projects.id, ref.projectId))
      .limit(1);
    if (row?.email) {
      await sendOutlineApprovalEmail({
        userId: ref.userId,
        to: row.email,
        bookTitle: row.title,
        projectId: ref.projectId,
        runId: ref.dbRunId,
        pauseVersion,
      });
      try {
        const [{ start }, { outlineApprovalReminder }] = await Promise.all([
          import("workflow/api"),
          import("@/workflows/outline-reminder"),
        ]);
        await start(outlineApprovalReminder, [ref.dbRunId, ref.projectId, pauseVersion]);
      } catch (error) {
        console.warn("[email] outline reminder could not be scheduled:", error);
      }
    }
  } catch (error) {
    console.warn("[email] outline-approval notification failed:", error);
  }
}

/** Emails one idempotent notice only after the creative-direction hook is actionable. */
export async function notifyCreativeDecisionStep(ref: RunRef, pauseVersion: number): Promise<void> {
  "use step";
  try {
    const [row] = await getDb()
      .select({ email: schema.users.email, title: schema.projects.title })
      .from(schema.projects)
      .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
      .where(and(eq(schema.projects.id, ref.projectId), eq(schema.projects.userId, ref.userId)))
      .limit(1);
    if (!row?.email) return;
    await sendCreativeDecisionEmail({
      userId: ref.userId,
      to: row.email,
      bookTitle: row.title,
      projectId: ref.projectId,
      runId: ref.dbRunId,
      pauseVersion,
    });
  } catch (error) {
    console.warn("[email] creative-decision notification failed:", error);
  }
}

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";

import { getDb, withDbTransaction, schema } from "@/db";
import { buildBookGenerationConfig } from "@/lib/book-start";
import { chapterTopologyFingerprint, outlineStateFingerprint } from "@/lib/manuscript-state";
import { latestResumableRunId, type GenerationConfig } from "@/lib/run-events";
import {
  claimUncertainAuthoringRun,
  linkAuthoringRunWorkflow,
  markAuthoringRunAcceptanceUncertain,
  terminalizeAuthoringRun,
} from "@/lib/generation-runs";

function requestedPaidTier(config: Partial<GenerationConfig>): GenerationConfig["tier"] | null {
  return config.tier === "draft" || config.tier === "standard" || config.tier === "premium"
    ? config.tier
    : null;
}

export function buildDispatchReadyFullBookConfig(input: {
  project: typeof schema.projects.$inferSelect;
  requested: Partial<GenerationConfig>;
  chapterRows: Parameters<typeof chapterTopologyFingerprint>[0];
  latestOutline: Parameters<typeof outlineStateFingerprint>[0];
  priorRuns: Array<{
    id: string;
    status: string;
    config: Partial<GenerationConfig> | null | undefined;
  }>;
}): GenerationConfig {
  const authoritative = buildBookGenerationConfig(input.project);
  const baseConfig: GenerationConfig = {
    ...authoritative,
    ...(input.project.experience === "full_book" && requestedPaidTier(input.requested)
      ? { tier: requestedPaidTier(input.requested)! }
      : {}),
    ...(input.project.experience === "full_book" &&
    typeof input.requested.requireOutlineApproval === "boolean"
      ? { requireOutlineApproval: input.requested.requireOutlineApproval }
      : {}),
    chapterTopologyFingerprint: chapterTopologyFingerprint(input.chapterRows),
    liveOutlineFingerprint: outlineStateFingerprint(input.latestOutline),
  };
  const resumeFromRunId = latestResumableRunId(baseConfig, input.priorRuns);
  return {
    ...baseConfig,
    ...(resumeFromRunId ? { resumeFromRunId } : {}),
    ...(resumeFromRunId
      ? {
          billingLineageRunId:
            input.priorRuns.find((prior) => prior.id === resumeFromRunId)?.config
              ?.billingLineageRunId ?? resumeFromRunId,
        }
      : {}),
    dispatchReady: true,
  };
}

/**
 * Freezes the exact full-book input snapshot after the queued row has taken
 * the project mutation lock. If the creator dies first, retry-start calls the
 * same helper before dispatch, so an optimistic pre-insert snapshot is never
 * sent to Workflow.
 */
export async function prepareFullBookRunDispatch(input: {
  runId: string;
  projectId: string;
  userId: string;
}): Promise<GenerationConfig | null> {
  return withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${input.projectId}, 0)
      )`,
    );

    const [run] = await tx
      .select({
        config: schema.generationRuns.config,
        kind: schema.generationRuns.kind,
      })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.id, input.runId),
          eq(schema.generationRuns.projectId, input.projectId),
          eq(schema.generationRuns.userId, input.userId),
          eq(schema.generationRuns.status, "queued"),
          eq(schema.generationRuns.kind, "full_book"),
          isNull(schema.generationRuns.workflowRunId),
        ),
      )
      .limit(1);
    if (!run) return null;
    const requested = (run.config ?? {}) as Partial<GenerationConfig>;
    if (requested.dispatchReady === true) return requested as GenerationConfig;

    const [project] = await tx
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.userId, input.userId)))
      .limit(1);
    const [book] = await tx
      .select({ id: schema.books.id })
      .from(schema.books)
      .where(eq(schema.books.projectId, input.projectId))
      .limit(1);
    if (!project || !book) return null;

    const chapterRows = await tx
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
    const [latestOutline] = await tx
      .select({
        id: schema.outlines.id,
        version: schema.outlines.version,
        source: schema.outlines.source,
        content: schema.outlines.content,
      })
      .from(schema.outlines)
      .where(eq(schema.outlines.bookId, book.id))
      .orderBy(desc(schema.outlines.version))
      .limit(1);
    const priorRuns = await tx
      .select({
        id: schema.generationRuns.id,
        status: schema.generationRuns.status,
        config: schema.generationRuns.config,
      })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.projectId, input.projectId),
          eq(schema.generationRuns.kind, "full_book"),
          ne(schema.generationRuns.id, input.runId),
        ),
      )
      .orderBy(desc(schema.generationRuns.createdAt));

    const config = buildDispatchReadyFullBookConfig({
      project,
      requested,
      chapterRows,
      latestOutline,
      priorRuns: priorRuns.map((prior) => ({
        ...prior,
        config: prior.config as Partial<GenerationConfig>,
      })),
    });

    const [ready] = await tx
      .update(schema.generationRuns)
      .set({ config })
      .where(
        and(
          eq(schema.generationRuns.id, input.runId),
          eq(schema.generationRuns.projectId, input.projectId),
          eq(schema.generationRuns.userId, input.userId),
          eq(schema.generationRuns.status, "queued"),
          eq(schema.generationRuns.kind, "full_book"),
          isNull(schema.generationRuns.workflowRunId),
        ),
      )
      .returning({ id: schema.generationRuns.id });
    return ready ? config : null;
  });
}

/** Marks an already-authoritative scoped config ready for external dispatch. */
export async function markAuthoringRunDispatchReady(input: {
  runId: string;
  projectId: string;
  userId: string;
  config: GenerationConfig;
}): Promise<GenerationConfig | null> {
  const config: GenerationConfig = { ...input.config, dispatchReady: true };
  return withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${input.projectId}, 0)
      )`,
    );
    const [ready] = await tx
      .update(schema.generationRuns)
      .set({ config })
      .where(
        and(
          eq(schema.generationRuns.id, input.runId),
          eq(schema.generationRuns.projectId, input.projectId),
          eq(schema.generationRuns.userId, input.userId),
          eq(schema.generationRuns.status, "queued"),
          isNull(schema.generationRuns.workflowRunId),
        ),
      )
      .returning({ id: schema.generationRuns.id });
    return ready ? config : null;
  });
}

export type SameRunRedispatchResult =
  | { outcome: "started" | "reattached"; workflowRunId: string | null }
  | { outcome: "not_eligible" | "acceptance_uncertain" | "unsupported"; workflowRunId: null };

/**
 * Trusted same-run recovery used by the watchdog and Admin. The database claim
 * enforces the two-minute lease and three-attempt ceiling; a duplicate remote
 * Workflow exits before paid work through its self-link guard.
 */
export async function redispatchUncertainAuthoringRun(input: {
  runId: string;
  projectId: string;
  userId: string;
}): Promise<SameRunRedispatchResult> {
  const db = getDb();
  const [snapshot] = await db
    .select({
      kind: schema.generationRuns.kind,
      config: schema.generationRuns.config,
      workflowRunId: schema.generationRuns.workflowRunId,
      cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.id, input.runId),
        eq(schema.generationRuns.projectId, input.projectId),
        eq(schema.generationRuns.userId, input.userId),
        eq(schema.generationRuns.status, "queued"),
        isNull(schema.generationRuns.workflowRunId),
      ),
    )
    .limit(1);
  if (!snapshot || snapshot.cancellationRequestedAt) {
    return { outcome: "not_eligible", workflowRunId: null };
  }
  let config = snapshot.config as Partial<GenerationConfig>;
  if (config.dispatchReady !== true) {
    if (snapshot.kind !== "full_book") {
      return { outcome: "not_eligible", workflowRunId: null };
    }
    const prepared = await prepareFullBookRunDispatch(input);
    if (!prepared) return { outcome: "not_eligible", workflowRunId: null };
    config = prepared;
  }

  const claimed = await claimUncertainAuthoringRun(input);
  if (!claimed) {
    const [current] = await db
      .select({ workflowRunId: schema.generationRuns.workflowRunId })
      .from(schema.generationRuns)
      .where(eq(schema.generationRuns.id, input.runId))
      .limit(1);
    return current?.workflowRunId
      ? { outcome: "reattached", workflowRunId: current.workflowRunId }
      : { outcome: "not_eligible", workflowRunId: null };
  }

  const { start } = await import("workflow/api");
  let invoke: () => Promise<{ runId: string }>;
  if (claimed.kind === "full_book") {
    const { generateBook } = await import("@/workflows/generate-book");
    invoke = () =>
      start(generateBook, [
        claimed.id,
        claimed.projectId,
        claimed.userId,
        claimed.config as GenerationConfig,
      ]);
  } else if (claimed.kind === "chapter") {
    const [reservation] = await db
      .select({ externalRef: schema.creditLedger.externalRef })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.userId, claimed.userId),
          eq(schema.creditLedger.projectId, claimed.projectId),
          eq(schema.creditLedger.runId, claimed.id),
          sql`${schema.creditLedger.externalRef} like ${`generation-reservation:${claimed.id}:chapter:%`}`,
          sql`not exists (
            select 1 from credit_ledger released
            where released.external_ref = 'release:' || ${schema.creditLedger.externalRef}
          )`,
        ),
      )
      .limit(1);
    const match = reservation?.externalRef?.match(/:chapter:(\d+)$/);
    const chapterNumber = match ? Number(match[1]) : Number.NaN;
    if (!reservation?.externalRef || !Number.isInteger(chapterNumber) || chapterNumber < 1) {
      await terminalizeAuthoringRun({
        runId: claimed.id,
        projectId: claimed.projectId,
        userId: claimed.userId,
        status: "failed",
        error: "Chapter retry reservation was unavailable before Workflow dispatch",
        releaseImmediately: true,
      });
      return { outcome: "unsupported", workflowRunId: null };
    }
    const { generateChapter } = await import("@/workflows/generate-chapter");
    invoke = () =>
      start(generateChapter, [
        claimed.id,
        claimed.projectId,
        claimed.userId,
        chapterNumber,
        claimed.config as GenerationConfig,
        reservation.externalRef!,
      ]);
  } else {
    return { outcome: "unsupported", workflowRunId: null };
  }

  try {
    const workflow = await invoke();
    const linked = await linkAuthoringRunWorkflow({
      runId: claimed.id,
      projectId: claimed.projectId,
      userId: claimed.userId,
      workflowRunId: workflow.runId,
    });
    if (linked) return { outcome: "started", workflowRunId: workflow.runId };
    const [current] = await db
      .select({ workflowRunId: schema.generationRuns.workflowRunId })
      .from(schema.generationRuns)
      .where(eq(schema.generationRuns.id, claimed.id))
      .limit(1);
    return {
      outcome: "reattached",
      workflowRunId: current?.workflowRunId ?? workflow.runId,
    };
  } catch {
    await markAuthoringRunAcceptanceUncertain(input);
    return { outcome: "acceptance_uncertain", workflowRunId: null };
  }
}

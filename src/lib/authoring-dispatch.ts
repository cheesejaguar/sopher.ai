import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";

import { withDbTransaction, schema } from "@/db";
import { buildBookGenerationConfig } from "@/lib/book-start";
import { chapterTopologyFingerprint, outlineStateFingerprint } from "@/lib/manuscript-state";
import { latestResumableRunId, type GenerationConfig } from "@/lib/run-events";

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

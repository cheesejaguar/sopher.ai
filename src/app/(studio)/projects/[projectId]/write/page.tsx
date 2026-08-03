import { notFound } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import {
  getActiveFullBookRun,
  getChapterList,
  getLatestFullBookRun,
  getProjectWithBook,
} from "@/db/queries/books";
import { estimateBookCost } from "@/ai/estimate";
import type { QualityTier } from "@/ai/models";
import type { GenerationConfig } from "@/lib/run-events";
import { WriteExperience } from "@/components/generation/write-experience";
import type { RunSnapshot, RunStatus } from "@/hooks/use-run-stream";
import { getStudioAccess } from "@/lib/studio-access";
import { getRunHealth } from "@/lib/run-health";
import { getBalance } from "@/lib/billing/credits";
import { fullBookRequiredCredits } from "@/lib/full-book-credit-requirement";

export default async function WritePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { userId } = await requireUser();
  const [data, access, balance] = await Promise.all([
    getProjectWithBook(userId, projectId),
    getStudioAccess(userId),
    getBalance(userId),
  ]);
  if (!data) notFound();
  const { project, book } = data;

  const run = (await getActiveFullBookRun(projectId)) ?? (await getLatestFullBookRun(projectId));
  const runConfig = (run?.config ?? {}) as Partial<GenerationConfig>;

  // Launch settings always come from the project as it exists now. A historical
  // run keeps its own frozen display shape, but must never override a restart.
  const launchTier: QualityTier = project.settings.qualityTier ?? "standard";
  const launchRequireOutlineApproval = project.settings.requireOutlineApproval ?? false;
  const launchEstimate = estimateBookCost(
    launchTier,
    project.targetChapters,
    project.targetWordsPerChapter,
  );
  const launchRequiredCredits = fullBookRequiredCredits({
    tier: launchTier,
    targetChapters: project.targetChapters,
    targetWordsPerChapter: project.targetWordsPerChapter,
  });
  const runTier: QualityTier = runConfig.tier ?? launchTier;
  const runTargetChapters = runConfig.targetChapters ?? project.targetChapters;
  const runTargetWordsPerChapter = runConfig.targetWordsPerChapter ?? project.targetWordsPerChapter;
  const runEstimate = estimateBookCost(runTier, runTargetChapters, runTargetWordsPerChapter);

  const chapters = book ? await getChapterList(book.id) : [];
  const titles: Record<number, string | null> = {};
  for (const chapter of chapters) {
    titles[chapter.chapterNumber] = chapter.title;
  }

  let snapshot: RunSnapshot | null = null;
  if (run) {
    const db = getDb();
    const [events, health] = await Promise.all([
      db
        .select({
          payload: schema.generationEvents.payload,
          createdAt: schema.generationEvents.createdAt,
        })
        .from(schema.generationEvents)
        // Internal replay markers share the run sequence but are deliberately
        // not part of the author-facing RunEvent stream contract.
        .where(
          and(
            eq(schema.generationEvents.runId, run.id),
            ne(schema.generationEvents.type, "tool_mutation"),
          ),
        )
        .orderBy(schema.generationEvents.seq),
      getRunHealth(run),
    ]);
    snapshot = {
      run: {
        id: run.id,
        status: run.status as RunStatus,
        error: run.error,
        kind: run.kind,
        workflowRunId: run.workflowRunId,
        createdAt: run.createdAt.toISOString(),
        startedAt: run.startedAt?.toISOString() ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
      },
      health: {
        databaseStatus: health.databaseStatus,
        workflowStatus: health.workflowStatus,
        effectiveStatus: health.effectiveStatus,
        stage: health.stage,
        progressPct: health.progressPct,
        stageDescription: health.stageDescription,
        acceptedAt: health.acceptedAt,
        ...(health.startedAt ? { startedAt: health.startedAt } : {}),
        ...(health.completedAt ? { completedAt: health.completedAt } : {}),
        ...(health.lastEventAt ? { lastEventAt: health.lastEventAt } : {}),
        ...(health.heartbeatAt ? { heartbeatAt: health.heartbeatAt } : {}),
        lastUpdateAt: health.lastUpdateAt,
        health: health.health,
        telemetryDegraded: health.health === "degraded",
        noWorkStarted: health.noWorkStarted,
        acceptanceUncertain: health.acceptanceUncertain,
        safeToRetry: health.safeToRetry,
        handoffConfirmed: Boolean(run.workflowRunId),
        elapsedMs: health.elapsedMs,
        ...(health.estimatedMinutes !== null ? { estimatedMinutes: health.estimatedMinutes } : {}),
        dispatchAttempts: health.dispatchAttempts,
        workflowMissingCount: health.workflowMissingCount,
        ...(health.workflowMissingSince
          ? { workflowMissingSince: health.workflowMissingSince }
          : {}),
        cancellation: health.cancellation,
        pause: health.pause,
        savedChapterCount: health.savedChapterCount,
        savedCheckpointCount: health.savedCheckpointCount,
        supportReference: health.supportReference,
        rootErrorCode: health.rootErrorCode,
        rootErrorStage: health.rootErrorStage,
        chapters: health.chapters,
      },
      events: events.map((event) => event.payload),
      chapters: chapters
        .filter((chapter) => chapter.chapterNumber <= runTargetChapters)
        .map((chapter) => ({
          number: chapter.chapterNumber,
          status: chapter.status,
          wordCount: chapter.wordCount || undefined,
          qualityScore: chapter.qualityScore !== null ? Number(chapter.qualityScore) : undefined,
        })),
      totalUsd: health.spend.meteredUsd,
      totalCredits: health.spend.creditsUsed,
      estimatedMinutes: runEstimate.estimatedMinutes,
    };
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">Write</h2>
        <p className="text-sm text-muted-foreground">
          {snapshot
            ? "Watch the draft arrive in real time — every word lands on the page as it's written."
            : "One click sends the brief to the agents. You can watch every word arrive."}
        </p>
      </header>

      <WriteExperience
        projectId={project.id}
        projectTitle={project.title}
        userId={userId}
        recoveryRequestKey={project.creationKey}
        experience={project.experience}
        fullBookUnlocked={access.fullBookUnlocked}
        tier={launchTier}
        requireOutlineApproval={launchRequireOutlineApproval}
        targetChapters={project.targetChapters}
        targetWordsPerChapter={project.targetWordsPerChapter}
        estimateUsd={launchEstimate.totalUsd}
        balanceCredits={balance}
        requiredCredits={launchRequiredCredits}
        estimatedMinutes={launchEstimate.estimatedMinutes}
        initialRunShape={
          run
            ? {
                tier: runTier,
                chapters: runTargetChapters,
                wordsPerChapter: runTargetWordsPerChapter,
                estimateUsd: runEstimate.totalUsd,
                estimatedMinutes: runEstimate.estimatedMinutes,
              }
            : undefined
        }
        initialSnapshot={snapshot}
        titles={titles}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";

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

export default async function WritePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
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
    const [events, [spend], [usageDebits]] = await Promise.all([
      db
        .select({ payload: schema.generationEvents.payload })
        .from(schema.generationEvents)
        .where(eq(schema.generationEvents.runId, run.id))
        .orderBy(schema.generationEvents.seq),
      db
        .select({ total: sql<string>`coalesce(sum(${schema.llmCalls.usd}), 0)` })
        .from(schema.llmCalls)
        .where(eq(schema.llmCalls.runId, run.id)),
      db
        .select({ total: sql<string>`coalesce(-sum(${schema.creditLedger.amount}), 0)` })
        .from(schema.creditLedger)
        .where(
          sql`${schema.creditLedger.runId} = ${run.id} and ${schema.creditLedger.kind} = 'usage'`,
        ),
    ]);
    snapshot = {
      run: { id: run.id, status: run.status as RunStatus, error: run.error, kind: run.kind },
      events: events.map((event) => event.payload),
      chapters: chapters
        .filter((chapter) => chapter.chapterNumber <= runTargetChapters)
        .map((chapter) => ({
          number: chapter.chapterNumber,
          status: chapter.status,
          wordCount: chapter.wordCount || undefined,
          qualityScore: chapter.qualityScore !== null ? Number(chapter.qualityScore) : undefined,
        })),
      totalUsd: Number(spend?.total ?? 0),
      totalCredits: Number(usageDebits?.total ?? 0),
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
        tier={launchTier}
        requireOutlineApproval={launchRequireOutlineApproval}
        targetChapters={project.targetChapters}
        targetWordsPerChapter={project.targetWordsPerChapter}
        estimateUsd={launchEstimate.totalUsd}
        initialRunShape={
          run
            ? {
                tier: runTier,
                chapters: runTargetChapters,
                wordsPerChapter: runTargetWordsPerChapter,
                estimateUsd: runEstimate.totalUsd,
              }
            : undefined
        }
        initialSnapshot={snapshot}
        titles={titles}
      />
    </div>
  );
}

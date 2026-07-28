import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getActiveRun, getChapterList, getLatestRun, getProjectWithBook } from "@/db/queries/books";
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

  const run = (await getActiveRun(projectId)) ?? (await getLatestRun(projectId));
  const runConfig = (run?.config ?? {}) as Partial<GenerationConfig>;

  const tier: QualityTier = runConfig.tier ?? project.settings.qualityTier ?? "standard";
  const requireOutlineApproval =
    runConfig.requireOutlineApproval ?? project.settings.requireOutlineApproval ?? false;
  const estimate = estimateBookCost(tier, project.targetChapters, project.targetWordsPerChapter);

  const chapters = book ? await getChapterList(book.id) : [];
  const titles: Record<number, string | null> = {};
  for (const chapter of chapters) {
    titles[chapter.chapterNumber] = chapter.title;
  }

  let snapshot: RunSnapshot | null = null;
  if (run) {
    const db = getDb();
    const [events, [spend]] = await Promise.all([
      db
        .select({ payload: schema.generationEvents.payload })
        .from(schema.generationEvents)
        .where(eq(schema.generationEvents.runId, run.id))
        .orderBy(schema.generationEvents.seq),
      db
        .select({ total: sql<string>`coalesce(sum(${schema.llmCalls.usd}), 0)` })
        .from(schema.llmCalls)
        .where(eq(schema.llmCalls.runId, run.id)),
    ]);
    snapshot = {
      run: { id: run.id, status: run.status as RunStatus, error: run.error },
      events: events.map((event) => event.payload),
      chapters: chapters.map((chapter) => ({
        number: chapter.chapterNumber,
        status: chapter.status,
        wordCount: chapter.wordCount || undefined,
        qualityScore: chapter.qualityScore !== null ? Number(chapter.qualityScore) : undefined,
      })),
      totalUsd: Number(spend?.total ?? 0),
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
        tier={tier}
        requireOutlineApproval={requireOutlineApproval}
        targetChapters={project.targetChapters}
        targetWordsPerChapter={project.targetWordsPerChapter}
        estimateUsd={estimate.totalUsd}
        estimatedMinutes={estimate.estimatedMinutes}
        initialSnapshot={snapshot}
        titles={titles}
      />
    </div>
  );
}

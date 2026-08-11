import { Suspense } from "react";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Feather } from "lucide-react";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { getAuthoringJourneySnapshot } from "@/db/queries/authoring-journey";
import { getChapterList, getChapterWithContent, getProjectWithBook } from "@/db/queries/books";
import { requireUser } from "@/lib/auth";
import { toSuggestionDTO, type SuggestionDTO } from "@/lib/editor/types";
import { EditorShellLoader } from "@/components/editor/editor-shell-loader";
import { EditorSkeleton } from "@/components/editor/editor-skeleton";
import { incompleteProductionStatus } from "@/components/studio/incomplete-production-notice";

function NotDraftedState({ chapterNumber }: { chapterNumber: number }) {
  return (
    <div className="instrument-surface relative flex min-h-72 flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <span aria-hidden="true" className="spectral-rule absolute inset-x-0 top-0 h-px" />
      <p className="folio-label text-primary">Chapter {String(chapterNumber).padStart(2, "0")}</p>
      <Feather aria-hidden="true" className="mt-4 size-6 text-muted-foreground" />
      <h2 className="mt-3 font-display text-lg font-semibold">This chapter is still blank</h2>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
        The writing stage has not produced a draft yet. Once it does, this chapter becomes a full
        editing surface with suggestions and revision history. The project-wide next step above
        reflects the current production state.
      </p>
    </div>
  );
}

export default async function EditorChapterPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; chapterNumber: string }>;
  searchParams: Promise<{ reviewRun?: string | string[] }>;
}) {
  const { projectId, chapterNumber: chapterParam } = await params;
  const { reviewRun: requestedReviewRun } = await searchParams;
  const number = Number(chapterParam);
  if (!Number.isInteger(number) || number < 1 || number > 10_000) notFound();

  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  if (!data?.book) notFound();
  const { project, book } = data;

  const chapter = await getChapterWithContent(book.id, number);
  if (!chapter) notFound();
  if (!chapter.content.trim()) {
    return <NotDraftedState chapterNumber={number} />;
  }

  const db = getDb();
  let reviewRunId: string | null = null;
  if (requestedReviewRun !== undefined) {
    if (typeof requestedReviewRun !== "string" || !z.uuid().safeParse(requestedReviewRun).success) {
      notFound();
    }
    const [reviewRun] = await db
      .select({ id: schema.generationRuns.id })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.id, requestedReviewRun),
          eq(schema.generationRuns.projectId, projectId),
          eq(schema.generationRuns.userId, userId),
          eq(schema.generationRuns.kind, "edit_pass"),
        ),
      )
      .limit(1);
    if (!reviewRun) notFound();
    reviewRunId = reviewRun.id;
  }
  const [chapters, pendingRows] = await Promise.all([
    getChapterList(book.id),
    db
      .select()
      .from(schema.suggestions)
      .where(
        and(
          eq(schema.suggestions.chapterId, chapter.id),
          eq(schema.suggestions.status, "pending"),
          ...(reviewRunId
            ? [eq(schema.suggestions.runId, reviewRunId), eq(schema.suggestions.passType, "review")]
            : []),
        ),
      )
      .orderBy(schema.suggestions.createdAt),
  ]);
  const initialSuggestions: SuggestionDTO[] = pendingRows.map(toSuggestionDTO);
  const journey = await getAuthoringJourneySnapshot({
    userId,
    projectId,
    data,
    chapters,
  });
  const productionStatus = journey ? incompleteProductionStatus(journey) : null;

  return (
    <Suspense fallback={<EditorSkeleton />}>
      <EditorShellLoader
        key={`${chapter.id}:${reviewRunId ?? "all"}`}
        projectId={projectId}
        chapterId={chapter.id}
        chapterNumber={chapter.chapterNumber}
        chapterTitle={chapter.title}
        bookTitle={book.title}
        content={chapter.content}
        version={chapter.version}
        targetWords={project.targetWordsPerChapter}
        chapters={chapters.map((c) => ({
          id: c.id,
          chapterNumber: c.chapterNumber,
          title: c.title,
          wordCount: c.wordCount,
          status: c.status,
        }))}
        initialSuggestions={initialSuggestions}
        reviewRunId={reviewRunId}
        productionStatus={
          productionStatus
            ? { label: productionStatus.label, detail: productionStatus.detail }
            : null
        }
      />
    </Suspense>
  );
}

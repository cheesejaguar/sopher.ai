import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowRight, Feather } from "lucide-react";

import { getDb, schema } from "@/db";
import { getChapterList, getChapterWithContent, getProjectWithBook } from "@/db/queries/books";
import { requireUser } from "@/lib/auth";
import { toSuggestionDTO, type SuggestionDTO } from "@/lib/editor/types";
import { EditorShellLoader } from "@/components/editor/editor-shell-loader";
import { EditorSkeleton } from "@/components/editor/editor-skeleton";

function NotDraftedState({
  projectId,
  chapterNumber,
}: {
  projectId: string;
  chapterNumber: number;
}) {
  return (
    <div className="instrument-surface relative flex min-h-72 flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <span aria-hidden="true" className="spectral-rule absolute inset-x-0 top-0 h-px" />
      <p className="folio-label text-primary">Chapter {String(chapterNumber).padStart(2, "0")}</p>
      <Feather aria-hidden="true" className="mt-4 size-6 text-muted-foreground" />
      <h2 className="mt-3 font-display text-lg font-semibold">This chapter is still blank</h2>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
        The writing stage has not produced a draft yet. Once it does, this chapter becomes a full
        editing surface with suggestions and revision history.
      </p>
      <Link
        href={`/projects/${projectId}/write`}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-sm border border-border px-4 text-sm font-medium text-primary transition-colors hover:bg-accent"
      >
        Go to the Write stage
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}

export default async function EditorChapterPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterNumber: string }>;
}) {
  const { projectId, chapterNumber: chapterParam } = await params;
  const number = Number(chapterParam);
  if (!Number.isInteger(number) || number < 1 || number > 10_000) notFound();

  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  if (!data?.book) notFound();
  const { project, book } = data;

  const chapter = await getChapterWithContent(book.id, number);
  if (!chapter) notFound();
  if (!chapter.content.trim()) {
    return <NotDraftedState projectId={projectId} chapterNumber={number} />;
  }

  const db = getDb();
  const [chapters, pendingRows] = await Promise.all([
    getChapterList(book.id),
    db
      .select()
      .from(schema.suggestions)
      .where(
        and(eq(schema.suggestions.chapterId, chapter.id), eq(schema.suggestions.status, "pending")),
      )
      .orderBy(schema.suggestions.createdAt),
  ]);
  const initialSuggestions: SuggestionDTO[] = pendingRows.map(toSuggestionDTO);

  return (
    <Suspense fallback={<EditorSkeleton />}>
      <EditorShellLoader
        key={chapter.id}
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
      />
    </Suspense>
  );
}

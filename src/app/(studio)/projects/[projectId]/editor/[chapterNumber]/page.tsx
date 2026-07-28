import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Feather } from "lucide-react";

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
    <div className="paper-surface flex min-h-72 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Feather aria-hidden="true" className="size-6 text-paper-muted" />
      <h2 className="font-display text-lg font-semibold">Chapter {chapterNumber} is still blank</h2>
      <p className="max-w-sm text-sm leading-relaxed text-paper-muted">
        The writers haven&apos;t drafted this chapter yet. Once a draft lands you can line-edit it
        here with suggestions in the margin.
      </p>
      <Link
        href={`/projects/${projectId}/write`}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Go to the Write stage
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

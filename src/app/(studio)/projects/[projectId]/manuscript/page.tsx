import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { ChapterPager } from "@/components/manuscript/chapter-pager";
import { ExportDialog } from "@/components/manuscript/export-dialog";
import { ManuscriptRail } from "@/components/manuscript/manuscript-rail";
import { buttonVariants } from "@/components/ui/button";
import { markdownToHtml } from "@/lib/export/assemble";
import { requireUser } from "@/lib/auth";
import { getChapterList, getChapterWithContent, getProjectWithBook } from "@/db/queries/books";

function EmptyManuscript({ projectId }: { projectId: string }) {
  return (
    <div className="paper-surface flex flex-col items-center gap-4 px-6 py-20 text-center">
      <p aria-hidden="true" className="text-2xl text-paper-muted">
        ⁂
      </p>
      <div className="space-y-1">
        <h3 className="font-display text-xl font-semibold text-paper-foreground">
          Nothing to read yet
        </h3>
        <p className="font-serif text-paper-muted italic">the writing desk is empty</p>
      </div>
      <Link
        href={`/projects/${projectId}/write` as Route}
        className={buttonVariants({ variant: "default", size: "sm" })}
      >
        Start writing
      </Link>
    </div>
  );
}

export default async function ManuscriptPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ chapter?: string | string[] }>;
}) {
  const [{ projectId }, sp] = await Promise.all([params, searchParams]);
  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  if (!data) notFound();
  const { project, book } = data;

  const chapterRows = book ? await getChapterList(book.id) : [];
  const readable = chapterRows.filter((c) => c.wordCount > 0);

  if (!book || readable.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="sr-only">Manuscript</h2>
        <EmptyManuscript projectId={projectId} />
      </div>
    );
  }

  const requestedRaw = Array.isArray(sp.chapter) ? sp.chapter[0] : sp.chapter;
  const requested = Number(requestedRaw);
  const activeIndex = Math.max(
    0,
    readable.findIndex((c) => c.chapterNumber === requested),
  );
  const active = readable[activeIndex];
  const chapter = await getChapterWithContent(book.id, active.chapterNumber);
  if (!chapter) notFound();

  const previous = activeIndex > 0 ? readable[activeIndex - 1] : null;
  const next = activeIndex < readable.length - 1 ? readable[activeIndex + 1] : null;
  const isOpening = activeIndex === 0;
  const chapterTitle = chapter.title?.trim() || `Chapter ${chapter.chapterNumber}`;
  const totalWords = readable.reduce((sum, c) => sum + c.wordCount, 0);

  return (
    <div className="space-y-4">
      <h2 className="sr-only">Manuscript</h2>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            Chapter {active.chapterNumber} of {readable.length} readable ·{" "}
            {totalWords.toLocaleString("en-US")} words
          </p>
          <ManuscriptRail
            projectId={projectId}
            chapters={chapterRows.map(({ chapterNumber, status }) => ({
              number: chapterNumber,
              status,
            }))}
            activeChapter={active.chapterNumber}
          />
        </div>
        <ExportDialog projectId={projectId} />
      </header>

      <div className="paper-surface px-6 py-12 sm:px-12 sm:py-16">
        {isOpening ? (
          <header className="mx-auto max-w-2xl py-10 text-center sm:py-16 [content-visibility:auto]">
            {project.genre ? (
              <p className="font-sans text-xs tracking-[0.25em] text-paper-muted uppercase">
                {project.genre}
              </p>
            ) : null}
            <h3 className="mt-5 font-display text-4xl font-semibold text-balance text-paper-foreground sm:text-5xl">
              {book.title}
            </h3>
            {book.synopsis ? (
              <p className="mx-auto mt-6 max-w-prose font-serif text-paper-muted">
                {book.synopsis}
              </p>
            ) : null}
            <p className="mt-6 font-serif text-paper-muted italic">an early reading copy</p>
            <p aria-hidden="true" className="mt-12 text-paper-muted">
              ⁂
            </p>
          </header>
        ) : null}

        <section className="prose-manuscript prose-manuscript--book mx-auto [content-visibility:auto]">
          <h2>
            Chapter {chapter.chapterNumber}
            {chapterTitle !== `Chapter ${chapter.chapterNumber}` ? (
              <>
                <br />
                {chapterTitle}
              </>
            ) : null}
          </h2>
          <div
            // Manuscript markdown rendered server-side; raw HTML is escaped in markdownToHtml.
            dangerouslySetInnerHTML={{ __html: markdownToHtml(chapter.content) }}
          />
        </section>
      </div>

      <ChapterPager
        projectId={projectId}
        previous={
          previous
            ? {
                number: previous.chapterNumber,
                title: previous.title ?? `Chapter ${previous.chapterNumber}`,
              }
            : null
        }
        next={
          next
            ? { number: next.chapterNumber, title: next.title ?? `Chapter ${next.chapterNumber}` }
            : null
        }
      />
    </div>
  );
}

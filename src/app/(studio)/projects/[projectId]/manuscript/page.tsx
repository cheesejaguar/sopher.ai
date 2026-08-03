import { notFound } from "next/navigation";

import { ChapterPager } from "@/components/manuscript/chapter-pager";
import Image from "next/image";
import Link from "next/link";
import { BookMarked } from "lucide-react";

import { BookIdentityDialog } from "@/components/manuscript/book-identity-dialog";
import { CoverButton } from "@/components/manuscript/cover-button";
import { ExportDialog } from "@/components/manuscript/export-dialog";
import { ShareReaderDialog } from "@/components/manuscript/share-reader-dialog";
import { ManuscriptRail } from "@/components/manuscript/manuscript-rail";
import { Button } from "@/components/ui/button";
import { markdownToHtml } from "@/lib/export/assemble";
import { loadFigures } from "@/lib/export/figures";
import { requireUser } from "@/lib/auth";
import { closingBookMatter, openingBookMatter, readBookMatter } from "@/lib/book-package";
import { getChapterList, getChapterWithContent, getProjectWithBook } from "@/db/queries/books";
import { ManuscriptSearch } from "@/components/editor/manuscript-search";
import { ManuscriptStatsPanel } from "@/components/manuscript/manuscript-stats-panel";
import { manuscriptStats } from "@/lib/manuscript-stats";
import { getAuthoringJourneySnapshot } from "@/db/queries/authoring-journey";
import { IncompleteProductionNotice } from "@/components/studio/incomplete-production-notice";
import { HashFocusTarget } from "@/components/studio/hash-focus-target";

function EmptyManuscript() {
  return (
    <div className="manuscript-sheet flex flex-col items-center gap-4 px-6 py-20 text-center">
      <p aria-hidden="true" className="text-2xl text-paper-muted">
        ⁂
      </p>
      <div className="space-y-1">
        <h3 className="font-display text-xl font-semibold text-paper-foreground">
          Nothing to read yet
        </h3>
        <p className="font-serif text-paper-muted italic">the writing desk is empty</p>
        <p className="max-w-sm text-sm leading-relaxed text-paper-muted">
          The project-wide next step above shows what is needed before chapters can be read here.
        </p>
      </div>
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
  const journey = await getAuthoringJourneySnapshot({
    userId,
    projectId,
    data,
    chapters: chapterRows,
  });

  if (!book || readable.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="sr-only">Manuscript</h2>
        <EmptyManuscript />
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

  // Cached diagram renders, so mermaid fences read as diagrams rather than source.
  const figures = await loadFigures(projectId);

  const previous = activeIndex > 0 ? readable[activeIndex - 1] : null;
  const next = activeIndex < readable.length - 1 ? readable[activeIndex + 1] : null;
  const isOpening = activeIndex === 0;
  const isClosing = activeIndex === readable.length - 1;
  const chapterTitle = chapter.title?.trim() || `Chapter ${chapter.chapterNumber}`;
  const totalWords = readable.reduce((sum, c) => sum + c.wordCount, 0);
  const matter = readBookMatter(book.frontMatter);
  const openingMatter = openingBookMatter(matter);
  const closingMatter = closingBookMatter(matter);

  return (
    <div className="space-y-4">
      <h2 className="sr-only">Manuscript</h2>
      {journey ? <IncompleteProductionNotice journey={journey} /> : null}

      <HashFocusTarget
        as="header"
        id="manuscript-actions"
        className="instrument-surface scroll-mt-28 flex flex-wrap items-center justify-between gap-4 rounded-sm p-4"
      >
        <div className="min-w-0 space-y-2">
          <p className="folio-label text-muted-foreground">
            Chapter {active.chapterNumber} of {readable.length} readable ·{" "}
            {totalWords.toLocaleString("en-US")} words
          </p>
          <div
            role="region"
            aria-label="Manuscript chapters"
            tabIndex={0}
            className="max-w-full overflow-x-auto py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ManuscriptRail
              projectId={projectId}
              chapters={chapterRows.map(({ chapterNumber, status }) => ({
                number: chapterNumber,
                status,
              }))}
              activeChapter={active.chapterNumber}
            />
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <CoverButton projectId={projectId} hasCover={Boolean(matter.coverUrl)} />
          <Button variant="ghost" size="sm" render={<Link href={`/projects/${projectId}/book`} />}>
            <BookMarked aria-hidden="true" />
            Book setup
          </Button>
          <BookIdentityDialog
            projectId={projectId}
            title={book.title}
            synopsis={book.synopsis}
            author={matter.author ?? null}
          />
          <ShareReaderDialog projectId={projectId} />
          <ExportDialog projectId={projectId} />
        </div>
      </HashFocusTarget>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <ManuscriptStatsPanel
          stats={manuscriptStats({
            chapters: chapterRows.map((chapter) => ({
              number: chapter.chapterNumber,
              title: chapter.title,
              words: chapter.wordCount,
            })),
            targetChapters: project.targetChapters,
            targetWordsPerChapter: project.targetWordsPerChapter,
            matter,
          })}
        />
        <ManuscriptSearch projectId={projectId} />
      </div>

      <div className="manuscript-sheet min-w-0 px-4 py-8 sm:px-12 sm:py-16">
        {isOpening ? (
          <header className="mx-auto max-w-2xl py-6 text-center sm:py-16 [content-visibility:auto]">
            {matter.coverUrl ? (
              <Image
                src={matter.coverUrl}
                alt={`Cover of ${book.title}`}
                width={288}
                height={432}
                className="mx-auto mb-8 h-auto w-48 rounded-sm shadow-lg sm:w-56"
              />
            ) : null}
            {project.genre ? (
              <p className="font-sans text-xs tracking-[0.25em] text-paper-muted uppercase">
                {project.genre}
              </p>
            ) : null}
            {/* h2, not h3: the chapter heading further down is an h2, and a
                title page that reads as its subordinate inverts the outline. */}
            <h2 className="mt-5 font-display text-4xl font-semibold text-balance text-paper-foreground sm:text-5xl">
              {book.title}
            </h2>
            {matter.subtitle ? (
              <p className="mx-auto mt-4 max-w-prose font-serif text-xl text-paper-muted">
                {matter.subtitle}
              </p>
            ) : null}
            <p className="mt-8 font-serif text-paper-muted">
              {matter.author ?? "Written with sopher.ai"}
            </p>
            <p className="mt-3 font-serif text-sm text-paper-muted italic">
              {matter.editionName ?? "an early reading copy"}
            </p>
            <p aria-hidden="true" className="mt-12 text-paper-muted">
              ⁂
            </p>
          </header>
        ) : null}

        {isOpening && (matter.copyrightHolder || matter.publisher || matter.isbn) ? (
          <section className="mx-auto max-w-2xl border-t border-paper-edge py-12 font-serif text-sm leading-relaxed text-paper-muted sm:py-16">
            <h2 className="sr-only">Copyright and edition details</h2>
            {matter.copyrightHolder ? (
              <p>
                © {matter.copyrightYear ?? new Date().getFullYear()} {matter.copyrightHolder}. All
                rights reserved.
              </p>
            ) : null}
            {matter.publisher ? <p>Published by {matter.publisher}.</p> : null}
            {matter.isbn ? <p>ISBN {matter.isbn}</p> : null}
          </section>
        ) : null}

        {isOpening && matter.dedication ? (
          <section className="mx-auto max-w-xl border-t border-paper-edge py-16 text-center sm:py-24">
            <h2 className="sr-only">Dedication</h2>
            <p className="font-serif text-lg italic text-paper-foreground">{matter.dedication}</p>
          </section>
        ) : null}

        {isOpening && matter.epigraphText ? (
          <section className="mx-auto max-w-xl border-t border-paper-edge py-16 sm:py-24">
            <h2 className="sr-only">Epigraph</h2>
            <blockquote className="font-serif text-lg leading-relaxed text-paper-foreground">
              <p>{matter.epigraphText}</p>
              {matter.epigraphAttribution ? (
                <footer className="mt-4 text-right text-sm text-paper-muted">
                  — {matter.epigraphAttribution}
                </footer>
              ) : null}
            </blockquote>
          </section>
        ) : null}

        {isOpening
          ? openingMatter.map((section) => (
              <section
                key={section.key}
                className="prose-manuscript mx-auto border-t border-paper-edge py-12 sm:py-16"
              >
                <h2>{section.title}</h2>
                <div
                  dangerouslySetInnerHTML={{
                    __html: markdownToHtml(section.markdown, figures),
                  }}
                />
              </section>
            ))
          : null}

        <section className="prose-manuscript prose-manuscript--book mx-auto border-t border-paper-edge pt-12 [content-visibility:auto] sm:pt-16">
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
            dangerouslySetInnerHTML={{ __html: markdownToHtml(chapter.content, figures) }}
          />
        </section>

        {isClosing
          ? closingMatter.map((section) => (
              <section
                key={section.key}
                className="prose-manuscript mx-auto mt-16 border-t border-paper-edge pt-12 sm:mt-24 sm:pt-16"
              >
                <h2>{section.title}</h2>
                <div
                  dangerouslySetInnerHTML={{
                    __html: markdownToHtml(section.markdown, figures),
                  }}
                />
              </section>
            ))
          : null}
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

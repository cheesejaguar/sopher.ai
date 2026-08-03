import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, PenLine } from "lucide-react";

import { ArchivedChaptersPanel } from "@/components/editor/archived-chapters-panel";
import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import {
  getArchivedChapterRecoveries,
  getChapterList,
  getProjectWithBook,
} from "@/db/queries/books";
import {
  chapterStatusDotClasses,
  chapterStatusLabels,
  formatWordCount,
} from "@/lib/editor/chapter-status";
import { getAuthoringJourneySnapshot } from "@/db/queries/authoring-journey";
import { IncompleteProductionNotice } from "@/components/studio/incomplete-production-notice";

export default async function EditorIndexPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  if (!data) notFound();

  const [chapters, archivedChapters] = data.book
    ? await Promise.all([getChapterList(data.book.id), getArchivedChapterRecoveries(data.book.id)])
    : [[], []];
  const journey = await getAuthoringJourneySnapshot({
    userId,
    projectId,
    data,
    chapters,
  });

  return (
    <div className="space-y-5">
      <header className="border-l-2 border-primary pl-4">
        <p className="folio-label text-primary">03 / Refine</p>
        <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
          Editorial workbench
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Choose a drafted chapter to line-edit the manuscript, request focused changes, and decide
          which suggestions become part of the book.
        </p>
      </header>

      {journey ? <IncompleteProductionNotice journey={journey} /> : null}

      {chapters.length === 0 ? (
        <div className="instrument-surface relative flex min-h-56 flex-col items-center justify-center overflow-hidden px-6 py-12 text-center">
          <span aria-hidden="true" className="spectral-rule absolute inset-x-0 top-0 h-px" />
          <PenLine aria-hidden="true" className="size-5 text-primary" />
          <p className="mt-3 font-display text-base font-semibold">Nothing to edit yet</p>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Drafted chapters will appear here as a numbered editorial queue. The project-wide next
            step above shows what this book needs now.
          </p>
        </div>
      ) : (
        <section
          aria-labelledby="editor-queue-heading"
          className="instrument-surface overflow-hidden"
        >
          <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
            <div>
              <p className="folio-label text-muted-foreground">Chapter queue</p>
              <h3 id="editor-queue-heading" className="mt-1 text-sm font-semibold">
                Select a manuscript section
              </h3>
            </div>
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
            </p>
          </div>
          <ul className="divide-y divide-border">
            {chapters.map((chapter) => {
              const editable = chapter.status !== "planned";
              const inner = (
                <>
                  <span className="folio-label w-9 shrink-0 text-primary tabular-nums">
                    {String(chapter.chapterNumber).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      chapterStatusDotClasses[chapter.status],
                    )}
                  >
                    <span className="sr-only">{chapterStatusLabels[chapter.status]}.</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {chapter.title ?? "Untitled"}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground tabular-nums">
                      {editable
                        ? `${formatWordCount(chapter.wordCount)} words · ${chapterStatusLabels[chapter.status]}`
                        : "Awaiting first draft"}
                    </span>
                  </span>
                  {editable ? (
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
                    />
                  ) : null}
                </>
              );
              const itemClasses =
                "group relative flex min-h-16 items-center gap-3 border-l-2 border-l-transparent px-4 py-3 sm:px-5";
              return (
                <li key={chapter.id}>
                  {editable ? (
                    <Link
                      href={`/projects/${projectId}/editor/${chapter.chapterNumber}`}
                      className={cn(
                        itemClasses,
                        "transition-colors hover:border-l-primary hover:bg-accent/60 focus-visible:border-l-primary",
                      )}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className={cn(itemClasses, "opacity-55")}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ArchivedChaptersPanel projectId={projectId} chapters={archivedChapters} />
    </div>
  );
}

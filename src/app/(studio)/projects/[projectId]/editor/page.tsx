import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, PenLine } from "lucide-react";

import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import { getChapterList, getProjectWithBook } from "@/db/queries/books";
import {
  chapterStatusDotClasses,
  chapterStatusLabels,
  formatWordCount,
} from "@/lib/editor/chapter-status";

export default async function EditorIndexPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  if (!data) notFound();

  const chapters = data.book ? await getChapterList(data.book.id) : [];

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">Editor</h2>
        <p className="text-sm text-muted-foreground">
          The editor opens on a chapter. Pick one to line-edit it with AI suggestions in the margin.
        </p>
      </header>

      {chapters.length === 0 ? (
        <div className="paper-surface flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <PenLine aria-hidden="true" className="size-5 text-paper-muted" />
          <p className="font-display text-base font-semibold">Nothing to edit yet</p>
          <p className="max-w-sm text-sm leading-relaxed text-paper-muted">
            Once the writers draft your chapters they appear here, ready for your editorial pass.
          </p>
          <Link
            href={`/projects/${projectId}/write`}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Go to the Write stage
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {chapters.map((chapter) => {
            const editable = chapter.status !== "planned";
            const inner = (
              <>
                <span className="w-6 shrink-0 text-right font-mono text-sm text-muted-foreground tabular-nums">
                  {chapter.chapterNumber}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    chapterStatusDotClasses[chapter.status],
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {chapter.title ?? "Untitled"}
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground tabular-nums">
                    {editable
                      ? `${formatWordCount(chapter.wordCount)} words · ${chapterStatusLabels[chapter.status]}`
                      : "not drafted yet"}
                  </span>
                </span>
                {editable ? (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                ) : null}
              </>
            );
            const itemClasses =
              "flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10";
            return (
              <li key={chapter.id}>
                {editable ? (
                  <Link
                    href={`/projects/${projectId}/editor/${chapter.chapterNumber}`}
                    className={cn(itemClasses, "transition-shadow hover:ring-foreground/25")}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className={cn(itemClasses, "opacity-60")}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

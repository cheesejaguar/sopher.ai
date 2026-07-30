"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ArchivedChapterRecovery } from "@/db/queries/books";
import { restoreArchivedChapter, type RestoreArchivedChapterResult } from "@/lib/actions/chapters";

function archivedTimestamp(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function wordCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function restoreError(result?: RestoreArchivedChapterResult): string {
  if (result && !result.ok) {
    if (result.error === "active_run") {
      return "Finish or stop the current production run before restoring an archived chapter.";
    }
    if (result.error === "not_archived") {
      return "This chapter is already back in the manuscript. Refresh the page to continue.";
    }
    if (result.error === "conflict") {
      return "The chapter changed before it could be restored. Refresh the page and try again.";
    }
  }
  return "Could not restore this archived chapter. Nothing changed — try again.";
}

export function ArchivedChaptersPanel({
  projectId,
  chapters,
}: {
  projectId: string;
  chapters: ArchivedChapterRecovery[];
}) {
  const router = useRouter();
  const [pendingChapterId, setPendingChapterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  if (chapters.length === 0) return null;

  async function restore(chapter: ArchivedChapterRecovery) {
    if (pendingChapterId !== null) return;
    setPendingChapterId(chapter.chapterId);
    setError(null);
    setStatus(`Restoring former chapter ${chapter.chapterNumber}…`);
    try {
      const result = await restoreArchivedChapter(chapter.chapterId, chapter.revisionId);
      if (!result.ok) {
        setError(restoreError(result));
        setStatus("");
        return;
      }

      setStatus(`Former chapter ${chapter.chapterNumber} restored. Opening it in the editor.`);
      router.push(`/projects/${projectId}/editor/${result.chapterNumber}`);
      router.refresh();
    } catch {
      setError(restoreError());
      setStatus("");
    } finally {
      setPendingChapterId(null);
    }
  }

  return (
    <section
      aria-busy={pendingChapterId !== null}
      aria-labelledby="archived-chapters-heading"
      className="instrument-surface overflow-hidden"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="folio-label text-muted-foreground">Recovery shelf</p>
        <h3 id="archived-chapters-heading" className="mt-1 text-sm font-semibold">
          Archived chapters from earlier runs
        </h3>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          A shorter book run retired these chapters without deleting their prose. Restore one to
          return it to the manuscript and open it in the editor.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="border-b border-destructive/30 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-border">
        {chapters.map((chapter) => {
          const pending = pendingChapterId === chapter.chapterId;
          const metadataId = `archived-chapter-${chapter.chapterId}-metadata`;
          return (
            <li key={chapter.chapterId}>
              <article className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">Former chapter {chapter.chapterNumber}</h4>
                  <p
                    id={metadataId}
                    className="mt-1 font-mono text-[0.6875rem] leading-5 text-muted-foreground tabular-nums"
                  >
                    {wordCount(chapter.wordCount)} words · archived{" "}
                    <time dateTime={new Date(chapter.archivedAt).toISOString()}>
                      {archivedTimestamp(chapter.archivedAt)}
                    </time>
                  </p>
                  <details className="mt-2 text-sm">
                    <summary className="min-h-11 cursor-pointer content-center rounded-sm text-xs font-medium text-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-9">
                      Preview archived prose
                    </summary>
                    <blockquote className="mt-2 border-l-2 border-border pl-3 font-serif text-sm leading-relaxed text-muted-foreground">
                      {chapter.excerpt}
                    </blockquote>
                  </details>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  aria-busy={pending || undefined}
                  aria-disabled={pendingChapterId !== null}
                  aria-describedby={metadataId}
                  aria-label={`Restore former chapter ${chapter.chapterNumber} to the manuscript`}
                  onClick={() => void restore(chapter)}
                  className="min-h-11 w-full aria-disabled:opacity-50 sm:w-auto"
                >
                  {pending ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <ArchiveRestore aria-hidden="true" className="size-4" />
                  )}
                  {pending ? "Restoring…" : "Restore to manuscript"}
                </Button>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

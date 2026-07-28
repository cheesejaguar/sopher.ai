"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { FolioRail } from "@/components/studio/folio-rail";
import { cn } from "@/lib/utils";
import {
  chapterStatusDotClasses,
  chapterStatusLabels,
  formatWordCount,
} from "@/lib/editor/chapter-status";
import type { ChapterNavItem } from "@/lib/editor/types";

export function ChapterSidebar({
  projectId,
  bookTitle,
  chapters,
  activeChapterNumber,
}: {
  projectId: string;
  bookTitle: string;
  chapters: ChapterNavItem[];
  activeChapterNumber: number;
}) {
  const router = useRouter();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border p-4">
        <Link
          href={`/projects/${projectId}/editor`}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-3" />
          All chapters
        </Link>
        <p className="mt-2 truncate font-display text-sm font-semibold" title={bookTitle}>
          {bookTitle}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-y-auto p-3">
        <FolioRail
          chapters={chapters.map((c) => ({ number: c.chapterNumber, status: c.status }))}
          activeChapter={activeChapterNumber}
          orientation="vertical"
          onSelect={(n) => router.push(`/projects/${projectId}/editor/${n}`)}
          className="sticky top-0 shrink-0"
        />
        <nav aria-label="Chapters" className="min-w-0 flex-1">
          <ul className="space-y-0.5">
            {chapters.map((chapter) => {
              const active = chapter.chapterNumber === activeChapterNumber;
              const drafted = chapter.status !== "planned";
              const inner = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      chapterStatusDotClasses[chapter.status],
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {chapter.chapterNumber}. {chapter.title ?? "Untitled"}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground tabular-nums">
                      {drafted
                        ? `${formatWordCount(chapter.wordCount)} words`
                        : chapterStatusLabels[chapter.status]}
                    </span>
                  </span>
                </>
              );
              const itemClass = cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5",
                active && "bg-accent text-accent-foreground",
              );
              return (
                <li key={chapter.id}>
                  {drafted ? (
                    <Link
                      href={`/projects/${projectId}/editor/${chapter.chapterNumber}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(itemClass, "transition-colors hover:bg-accent/70")}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className={cn(itemClass, "opacity-50")}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

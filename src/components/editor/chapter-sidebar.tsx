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
import { ChapterMenu } from "@/components/editor/chapter-menu";

export function ChapterSidebar({
  projectId,
  bookTitle,
  chapters,
  activeChapterNumber,
  touchFriendly = false,
  onNavigate,
}: {
  projectId: string;
  bookTitle: string;
  chapters: ChapterNavItem[];
  activeChapterNumber: number;
  /** Uses 44px chapter controls when the sidebar is hosted in a touch sheet. */
  touchFriendly?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        touchFriendly && "[&_button]:min-h-11 [&_button]:min-w-11",
      )}
    >
      <div className="border-b border-border p-4">
        <Link
          href={`/projects/${projectId}/editor`}
          className={cn(
            "flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
            touchFriendly && "min-h-11",
          )}
          onClick={onNavigate}
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
          onSelect={(n) => {
            onNavigate?.();
            router.push(`/projects/${projectId}/editor/${n}`);
          }}
          className={cn(
            "sticky top-0 shrink-0",
            touchFriendly && "[&_[role=option]]:h-11 [&_[role=option]]:w-11",
          )}
        />
        <nav aria-label="Chapters" className="min-w-0 flex-1">
          <ul className="space-y-0.5">
            {chapters.map((chapter) => {
              const active = chapter.chapterNumber === activeChapterNumber;
              const drafted = chapter.status !== "planned";
              const inner = (
                <>
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      chapterStatusDotClasses[chapter.status],
                    )}
                  >
                    {/* Drafted rows show a word count, so the dot's colour is
                        the only carrier of the status — name it for AT. */}
                    {drafted ? (
                      <span className="sr-only">{chapterStatusLabels[chapter.status]}.</span>
                    ) : null}
                  </span>
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
                "flex items-center gap-2 rounded-sm px-2 py-1.5",
                touchFriendly && "min-h-11 px-3 py-2",
                active && "bg-accent text-accent-foreground",
              );
              return (
                <li key={chapter.id} className="group/chapter relative">
                  {drafted ? (
                    <Link
                      href={`/projects/${projectId}/editor/${chapter.chapterNumber}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(itemClass, "pr-8 transition-colors hover:bg-accent/70")}
                      onClick={onNavigate}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className={cn(itemClass, "pr-8 opacity-50")}>{inner}</div>
                  )}
                  <span
                    className={cn(
                      "absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-focus-within/chapter:opacity-100 group-hover/chapter:opacity-100",
                      touchFriendly && "opacity-100",
                    )}
                  >
                    <ChapterMenu
                      projectId={projectId}
                      chapterId={chapter.id}
                      chapterNumber={chapter.chapterNumber}
                      title={chapter.title}
                      isFirst={chapter.chapterNumber === chapters[0]?.chapterNumber}
                      isLast={
                        chapter.chapterNumber === chapters[chapters.length - 1]?.chapterNumber
                      }
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

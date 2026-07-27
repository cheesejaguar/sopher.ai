"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type FolioChapterStatus = "planned" | "drafting" | "drafted" | "edited" | "final";

export interface FolioRailChapter {
  number: number;
  status: FolioChapterStatus;
}

export interface FolioRailProps {
  chapters: FolioRailChapter[];
  activeChapter?: number;
  onSelect?: (n: number) => void;
  orientation?: "vertical" | "horizontal";
  className?: string;
}

const statusLabels: Record<FolioChapterStatus, string> = {
  planned: "planned",
  drafting: "drafting",
  drafted: "drafted",
  edited: "edited",
  final: "final",
};

const statusClasses: Record<FolioChapterStatus, string> = {
  planned: "border-border bg-transparent hover:border-muted-foreground/60",
  drafting: "border-ai/40 bg-transparent hover:border-ai/70",
  drafted: "border-transparent bg-primary/70 hover:bg-primary/80",
  edited: "border-transparent bg-primary hover:bg-primary/90",
  final: "border-transparent bg-primary hover:bg-primary/90",
};

/**
 * A book-spine strip: one slim segment per chapter, ink-filled as the
 * manuscript progresses. Reused by the workspace rail, the generation
 * screen, and (later) the dashboard cards.
 */
export function FolioRail({
  chapters,
  activeChapter,
  onSelect,
  orientation = "vertical",
  className,
}: FolioRailProps) {
  const vertical = orientation === "vertical";
  const activeIndex = chapters.findIndex((c) => c.number === activeChapter);
  const [focusIndex, setFocusIndex] = React.useState<number | null>(null);
  const tabbableIndex = focusIndex ?? (activeIndex >= 0 ? activeIndex : 0);

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const forward = vertical ? "ArrowDown" : "ArrowRight";
    const backward = vertical ? "ArrowUp" : "ArrowLeft";
    let target: number | null = null;

    const listbox = event.currentTarget.closest('[role="listbox"]');
    if (!listbox) return;
    const options = Array.from(listbox.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    const index = options.indexOf(event.currentTarget);
    if (index < 0) return;

    if (event.key === forward) target = Math.min(index + 1, options.length - 1);
    else if (event.key === backward) target = Math.max(index - 1, 0);
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = options.length - 1;

    if (target === null) return;
    event.preventDefault();
    setFocusIndex(target);
    options[target]?.focus();
  }

  return (
    <TooltipProvider>
      <div
        role="listbox"
        aria-label="Chapters"
        aria-orientation={orientation}
        className={cn("flex w-fit gap-1", vertical ? "flex-col" : "flex-row", className)}
      >
        {chapters.map((chapter, index) => {
          const isActive = chapter.number === activeChapter;
          const label = `Chapter ${chapter.number} · ${statusLabels[chapter.status]}`;
          return (
            <Tooltip key={chapter.number}>
              <TooltipTrigger
                type="button"
                role="option"
                aria-selected={isActive}
                aria-label={label}
                tabIndex={index === tabbableIndex ? 0 : -1}
                onClick={() => onSelect?.(chapter.number)}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocusIndex(index)}
                className={cn(
                  "relative overflow-hidden rounded-[3px] border outline-none transition-colors motion-safe:duration-200",
                  vertical ? "h-6 w-10" : "h-10 w-6",
                  statusClasses[chapter.status],
                  isActive && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                  onSelect ? "cursor-pointer" : "cursor-default",
                )}
              >
                {chapter.status === "drafting" ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[55%] bg-ai motion-safe:animate-pulse"
                  />
                ) : null}
              </TooltipTrigger>
              <TooltipContent side={vertical ? "right" : "top"}>{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

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
  drafted: "border-primary/50 bg-primary/20 text-primary hover:bg-primary/28",
  edited: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
  final: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
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
  const railRef = React.useRef<HTMLDivElement>(null);
  const activeIndex = chapters.findIndex((c) => c.number === activeChapter);
  const [focusIndex, setFocusIndex] = React.useState<number | null>(null);
  // Clamped: if the chapter list shrinks below a remembered focus index, no
  // option would carry tabIndex 0 and the rail would drop out of the tab order.
  const tabbableIndex = Math.min(
    focusIndex ?? (activeIndex >= 0 ? activeIndex : 0),
    chapters.length - 1,
  );

  React.useEffect(() => {
    if (vertical || activeChapter === undefined) return;
    railRef.current
      ?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeChapter, vertical]);

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
        ref={railRef}
        role={onSelect ? "listbox" : "list"}
        aria-label={onSelect ? "Choose a chapter" : "Chapter status"}
        aria-orientation={onSelect ? orientation : undefined}
        className={cn(
          "flex gap-1",
          vertical ? "w-fit max-w-full flex-col" : "min-w-max flex-row p-1",
          className,
        )}
      >
        {chapters.map((chapter, index) => {
          const isActive = chapter.number === activeChapter;
          const label = `Chapter ${chapter.number} · ${statusLabels[chapter.status]}`;
          const segmentClassName = cn(
            "relative grid place-items-center overflow-hidden rounded-[3px] border font-mono text-[0.62rem] tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:duration-200",
            vertical ? "h-6 w-10" : "h-11 min-w-11 px-1",
            statusClasses[chapter.status],
            isActive && "ring-2 ring-ring ring-offset-2 ring-offset-background",
          );
          const contents = (
            <>
              {!vertical ? (
                <span className="relative z-10" aria-hidden="true">
                  {String(chapter.number).padStart(2, "0")}
                </span>
              ) : null}
              {chapter.status === "drafting" ? (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[55%] bg-ai" />
              ) : null}
            </>
          );

          if (!onSelect) {
            return (
              <span key={chapter.number} role="listitem" className={segmentClassName}>
                <span className="sr-only">{label}</span>
                {contents}
              </span>
            );
          }

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
                  segmentClassName,
                  // Keyboard focus must stay visible: the `ring` marks the
                  // selected chapter, not the focused one.
                  "cursor-pointer",
                )}
              >
                {contents}
              </TooltipTrigger>
              <TooltipContent side={vertical ? "right" : "top"}>{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { AlertTriangle, Check, Maximize2, MessageSquareText, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatWordCount } from "@/lib/editor/chapter-status";

import type { SaveState } from "./use-autosave";

const READING_WPM = 230;

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Spinner className="size-3" /> Saving…
      </span>
    );
  }
  if (state === "conflict") {
    return (
      <span className="flex items-center gap-1.5 text-destructive">
        <AlertTriangle aria-hidden="true" className="size-3" /> Conflict
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex items-center gap-1.5 text-ember">
        <AlertTriangle aria-hidden="true" className="size-3" /> Save failed — retrying on next edit
      </span>
    );
  }
  if (state === "dirty") {
    return <span className="text-muted-foreground">Unsaved changes</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Check aria-hidden="true" className="size-3 text-success" /> Saved
    </span>
  );
}

export function StatusBar({
  editor,
  saveState,
  targetWords,
  pendingCount,
  zen,
  onToggleZen,
  onOpenReview,
}: {
  editor: Editor | null;
  saveState: SaveState;
  targetWords: number;
  pendingCount: number;
  zen: boolean;
  onToggleZen: () => void;
  /** Present when the review panel is hidden (<xl) — opens it as a sheet. */
  onOpenReview?: () => void;
}) {
  const words = useEditorState({
    editor,
    selector: (ctx) => (ctx.editor?.storage.characterCount.words() as number | undefined) ?? 0,
  });
  const wordCount = words ?? 0;
  const readingMinutes = Math.max(1, Math.round(wordCount / READING_WPM));

  return (
    <TooltipProvider>
      <div className="flex h-9 shrink-0 items-center justify-between gap-4 border-t border-border bg-card px-3 text-xs">
        <div className="flex min-w-0 items-center gap-3">
          <SaveIndicator state={saveState} />
        </div>

        <p className="hidden font-mono text-muted-foreground tabular-nums sm:block">
          {formatWordCount(wordCount)}
          <span className="text-muted-foreground/60"> / {formatWordCount(targetWords)} words</span>
          <span className="text-muted-foreground/60"> · {readingMinutes} min read</span>
        </p>

        <div className="flex items-center gap-1">
          {onOpenReview ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onOpenReview}
            >
              <MessageSquareText aria-hidden="true" className="size-3.5 text-ai" />
              Suggestions
              {pendingCount > 0 ? (
                <span className="rounded-full bg-ai-soft px-1.5 font-mono text-[10px] text-ai tabular-nums">
                  {pendingCount}
                </span>
              ) : null}
            </Button>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-7", zen && "text-primary")}
                  aria-label={zen ? "Exit zen mode" : "Enter zen mode"}
                  onClick={onToggleZen}
                />
              }
            >
              {zen ? (
                <Minimize2 aria-hidden="true" className="size-3.5" />
              ) : (
                <Maximize2 aria-hidden="true" className="size-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent side="top">
              {zen ? "Exit zen (Esc)" : "Zen mode — just the page"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  AlertTriangle,
  Check,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Redo2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatWordCount } from "@/lib/editor/chapter-status";

import type { SaveState } from "./use-autosave";

const READING_WPM = 230;

/**
 * Announcements for the save state. "Unsaved changes" and "Saving…" are
 * transient and would chatter on every keystroke pause, so only the settled
 * outcomes are announced.
 */
const settledSaveMessages: Partial<Record<SaveState, string>> = {
  saved: "Chapter saved.",
  conflict: "Save conflict — this chapter changed somewhere else.",
  error: "Save failed. Retrying on your next edit.",
};

function SaveAnnouncer({ state }: { state: SaveState }) {
  const [message, setMessage] = useState("");
  const previous = useRef<SaveState>(state);

  useEffect(() => {
    if (previous.current === state) return;
    previous.current = state;
    setMessage(settledSaveMessages[state] ?? "");
  }, [state]);

  return (
    <span role="status" aria-live="polite" className="sr-only">
      {message}
    </span>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Spinner aria-hidden="true" className="size-3" /> Saving…
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
  extras,
}: {
  editor: Editor | null;
  saveState: SaveState;
  targetWords: number;
  pendingCount: number;
  zen: boolean;
  onToggleZen: () => void;
  /** Slot for chapter-scoped tools (history, find & replace). */
  extras?: React.ReactNode;
  /** Present when the review panel is hidden (<xl) — opens it as a sheet. */
  onOpenReview?: () => void;
}) {
  const words = useEditorState({
    editor,
    selector: (ctx) => (ctx.editor?.storage.characterCount.words() as number | undefined) ?? 0,
  });
  const historyState = useEditorState({
    editor,
    selector: (ctx) => ({
      canUndo: ctx.editor?.can().undo() ?? false,
      canRedo: ctx.editor?.can().redo() ?? false,
    }),
  });
  const wordCount = words ?? 0;
  const readingMinutes = Math.max(1, Math.round(wordCount / READING_WPM));

  return (
    <TooltipProvider>
      <div className="flex h-9 shrink-0 items-center justify-between gap-4 border-t border-border bg-card px-3 text-xs">
        <div className="flex min-w-0 items-center gap-3">
          <SaveIndicator state={saveState} />
          <SaveAnnouncer state={saveState} />
        </div>

        <p className="hidden font-mono text-muted-foreground tabular-nums sm:block">
          {formatWordCount(wordCount)}
          <span className="text-muted-foreground/60"> / {formatWordCount(targetWords)} words</span>
          <span className="text-muted-foreground/60"> · {readingMinutes} min read</span>
        </p>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Undo"
                  disabled={!historyState?.canUndo}
                  onClick={() => editor?.chain().focus().undo().run()}
                />
              }
            >
              <Undo2 aria-hidden="true" className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="top">Undo (⌘Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Redo"
                  disabled={!historyState?.canRedo}
                  onClick={() => editor?.chain().focus().redo().run()}
                />
              }
            >
              <Redo2 aria-hidden="true" className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="top">Redo (⌘⇧Z)</TooltipContent>
          </Tooltip>
          {extras}
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
                  <span className="sr-only"> pending</span>
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

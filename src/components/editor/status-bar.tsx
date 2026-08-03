"use client";

import { useEffect, useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  AlertTriangle,
  Check,
  CircleHelp,
  FilePenLine,
  ListTree,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Redo2,
  Search,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatWordCount } from "@/lib/editor/chapter-status";
import type { EditorProductionStatus } from "@/lib/editor/types";
import { useStudioCoachmark, useStudioHelp } from "@/components/studio/studio-help-context";
import { StudioCoachmark } from "@/components/studio/studio-coachmark";
import { useStudioSuspension } from "@/components/studio/studio-access-context";

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

export function SaveIndicator({ state, compact = false }: { state: SaveState; compact?: boolean }) {
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
        <AlertTriangle aria-hidden="true" className="size-3" />{" "}
        {compact ? "Save failed" : "Save failed — retrying on next edit"}
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

const mobileToolClass =
  "relative size-11 rounded-sm text-muted-foreground hover:text-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground";

export function CompactProductionStatus({
  status,
  compact = false,
}: {
  status: EditorProductionStatus;
  compact?: boolean;
}) {
  return (
    <div
      data-editor-production-status="true"
      aria-label="Incomplete production status"
      className={cn(
        "flex min-w-0 items-center gap-2 border-ember/30 bg-ember/8 text-ember",
        compact ? "border-t px-3 py-1.5 text-[11px]" : "shrink-0 border-b px-3 py-2 text-xs",
      )}
    >
      <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="shrink-0 font-semibold">{status.label}</span>
      <span aria-hidden="true" className="text-ember/60">
        ·
      </span>
      <span className="min-w-0 truncate text-foreground/75">{status.detail}</span>
    </div>
  );
}

/**
 * Phone and tablet editor orientation. Save state stays visible above the
 * software keyboard, while the chapter chooser remains a real dialog trigger.
 */
export function MobileEditorHeader({
  chapterNumber,
  chapterTitle,
  saveState,
  chaptersOpen,
  onOpenChapters,
  productionStatus,
}: {
  chapterNumber: number;
  chapterTitle: string | null;
  saveState: SaveState;
  chaptersOpen: boolean;
  onOpenChapters: () => void;
  productionStatus: EditorProductionStatus | null;
}) {
  const openHelp = useStudioHelp();
  const autosaveCoachmark = useStudioCoachmark("editor_autosave");

  return (
    <header className="safe-area-top shrink-0 border-b border-border bg-card">
      <div className="flex min-h-12 min-w-0 items-center gap-2 px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className={mobileToolClass}
          aria-label="Choose a chapter"
          aria-haspopup="dialog"
          aria-expanded={chaptersOpen}
          onClick={onOpenChapters}
        >
          <ListTree aria-hidden="true" className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="folio-label text-muted-foreground">Chapter {chapterNumber}</p>
          <p className="truncate text-sm font-semibold">
            {chapterTitle ?? `Chapter ${chapterNumber}`}
          </p>
        </div>
        <div className="shrink-0 text-[11px]">
          <SaveIndicator state={saveState} compact />
          <SaveAnnouncer state={saveState} />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className={mobileToolClass}
          aria-label="Help with editing"
          aria-haspopup="dialog"
          onClick={openHelp}
        >
          <CircleHelp aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {productionStatus ? <CompactProductionStatus status={productionStatus} compact /> : null}
      {autosaveCoachmark.visible ? (
        <StudioCoachmark title="Autosave and chapter history" onDismiss={autosaveCoachmark.dismiss}>
          Saved confirms the latest version is secure. History opens earlier saved versions, and a
          conflict warning protects changes made in another tab.
        </StudioCoachmark>
      ) : null}
    </header>
  );
}

/**
 * The touch editor's persistent command row. Every action is at least 44px,
 * named for assistive technology, and backed by the same TipTap commands as
 * the desktop workbench.
 */
export function MobileEditorToolbar({
  editor,
  pendingCount,
  zen,
  reviewOpen,
  selectionToolsOpen,
  findOpen,
  onOpenSelectionTools,
  onOpenReview,
  onOpenFind,
  onToggleZen,
  history,
}: {
  editor: Editor | null;
  pendingCount: number;
  zen: boolean;
  reviewOpen: boolean;
  selectionToolsOpen: boolean;
  findOpen: boolean;
  onOpenSelectionTools: () => void;
  onOpenReview: () => void;
  onOpenFind: () => void;
  onToggleZen: () => void;
  history: React.ReactNode;
}) {
  const suspended = useStudioSuspension();
  const selectionCoachmark = useStudioCoachmark("selection_tools");
  const autosaveCoachmark = useStudioCoachmark("editor_autosave");
  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      canUndo: ctx.editor?.can().undo() ?? false,
      canRedo: ctx.editor?.can().redo() ?? false,
      hasSelection: !(ctx.editor?.state.selection.empty ?? true),
    }),
  });

  return (
    <>
      {state?.hasSelection && selectionCoachmark.visible && !autosaveCoachmark.visible ? (
        <StudioCoachmark
          title="Work with the selected passage"
          onDismiss={selectionCoachmark.dismiss}
        >
          Edit selected passage opens focused rewriting and content tools for only the words you
          highlighted. Nothing changes until you approve it.
        </StudioCoachmark>
      ) : null}
      <div
        role="toolbar"
        aria-label="Chapter editing tools"
        className="safe-area-bottom shrink-0 border-t border-border bg-card px-1"
      >
        <div className="flex min-h-12 items-center justify-around">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className={mobileToolClass}
            aria-label="Undo"
            disabled={!state?.canUndo}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className={mobileToolClass}
            aria-label="Redo"
            disabled={!state?.canRedo}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className={cn(mobileToolClass, state?.hasSelection && "text-ai")}
            aria-label={
              suspended
                ? "AI editing unavailable — account suspended"
                : state?.hasSelection
                  ? "Edit the selected passage with AI"
                  : "AI editing unavailable — select a passage first"
            }
            aria-haspopup="dialog"
            aria-expanded={selectionToolsOpen}
            disabled={!state?.hasSelection || suspended}
            onClick={onOpenSelectionTools}
          >
            <FilePenLine aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className={cn(mobileToolClass, pendingCount > 0 && "text-ai")}
            aria-label={`Suggestions${pendingCount > 0 ? `, ${pendingCount} pending` : ""}`}
            aria-haspopup="dialog"
            aria-expanded={reviewOpen}
            onClick={onOpenReview}
          >
            <MessageSquareText aria-hidden="true" className="size-4" />
            {pendingCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 min-w-4 rounded-full bg-ai px-1 font-mono text-[11px] leading-4 text-ai-foreground"
              >
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className={mobileToolClass}
            aria-label="Find and replace"
            aria-haspopup="dialog"
            aria-expanded={findOpen}
            onClick={onOpenFind}
          >
            <Search aria-hidden="true" className="size-4" />
          </Button>
          {history}
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className={cn(mobileToolClass, zen && "text-primary")}
            aria-label={zen ? "Exit zen mode" : "Enter zen mode"}
            aria-pressed={zen}
            onClick={onToggleZen}
          >
            {zen ? (
              <Minimize2 aria-hidden="true" className="size-4" />
            ) : (
              <Maximize2 aria-hidden="true" className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

export function getEditorCoachmarkKind({
  autosaveVisible,
  selectionVisible,
  hasSelection,
}: {
  autosaveVisible: boolean;
  selectionVisible: boolean;
  hasSelection: boolean;
}): "autosave" | "selection" | null {
  if (autosaveVisible) return "autosave";
  if (selectionVisible && hasSelection) return "selection";
  return null;
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
      hasSelection: !(ctx.editor?.state.selection.empty ?? true),
    }),
  });
  const autosaveCoachmark = useStudioCoachmark("editor_autosave");
  const selectionCoachmark = useStudioCoachmark("selection_tools");
  const coachmarkKind = getEditorCoachmarkKind({
    autosaveVisible: autosaveCoachmark.visible,
    selectionVisible: selectionCoachmark.visible,
    hasSelection: historyState?.hasSelection ?? false,
  });
  const wordCount = words ?? 0;
  const readingMinutes = Math.max(1, Math.round(wordCount / READING_WPM));

  return (
    <TooltipProvider>
      {coachmarkKind === "autosave" ? (
        <StudioCoachmark title="Autosave and chapter history" onDismiss={autosaveCoachmark.dismiss}>
          Saved confirms the latest version is secure. Use History to review or restore an earlier
          saved version, and resolve any conflict before continuing in another tab.
        </StudioCoachmark>
      ) : null}
      {coachmarkKind === "selection" ? (
        <StudioCoachmark
          title="Work with the selected passage"
          onDismiss={selectionCoachmark.dismiss}
        >
          Select prose to open focused rewriting and content tools for only those words. Nothing
          changes until you approve it.
        </StudioCoachmark>
      ) : null}
      <div className="flex h-9 shrink-0 items-center justify-between gap-4 border-t border-border bg-card px-3 text-xs">
        <div className="flex min-w-0 items-center gap-3">
          <SaveIndicator state={saveState} />
          <SaveAnnouncer state={saveState} />
        </div>

        <p className="hidden font-mono text-muted-foreground tabular-nums sm:block">
          {formatWordCount(wordCount)}
          <span className="text-muted-foreground"> / {formatWordCount(targetWords)} words</span>
          <span className="text-muted-foreground"> · {readingMinutes} min read</span>
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
                <span className="rounded-full bg-ai-soft px-1.5 font-mono text-[11px] text-ai tabular-nums">
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

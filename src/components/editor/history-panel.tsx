"use client";

import { useEffect, useState, useTransition } from "react";
import { History, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { listChapterRevisions, restoreChapterRevision } from "@/lib/actions/chapters";
import { wordDiff } from "@/lib/editor/word-diff";
import { isGenerationResetSource } from "@/lib/generation-archive";
import { cn } from "@/lib/utils";

import { useMediaQuery } from "./use-media-query";

type Revision = {
  id: string;
  content: string;
  source: string;
  createdAt: Date;
};

const SOURCE_LABELS: Record<string, string> = {
  user: "Manual save",
  regenerate: "Before regeneration",
  "generation-reset": "Before a new book run",
  "pre-restore": "Before a restore",
  suggestion: "Suggestion applied",
  workflow: "Generated",
};

export function revisionSourceLabel(source: string): string {
  if (isGenerationResetSource(source)) return SOURCE_LABELS["generation-reset"];
  return SOURCE_LABELS[source] ?? source;
}

function timestamp(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * The chapter's saved history: every snapshot the autosaver, suggestion
 * pipeline, or regeneration recorded, each viewable as a word diff against
 * today's text and restorable in one click. Restoring snapshots the current
 * text first, so nothing is ever lost by looking around.
 */
export function HistoryPanel({
  chapterId,
  getCurrentContent,
  flush,
  onRestored,
  compact = false,
}: {
  chapterId: string;
  /** Called when the dialog opens; serializing the doc per keystroke would be waste. */
  getCurrentContent: () => string;
  /**
   * Flushes unsaved editor content to the server. Restore calls this first so
   * the server-side pre-restore snapshot captures what the author actually
   * sees, not the last autosave.
   */
  flush: () => Promise<boolean>;
  onRestored: (content: string, version: number) => void;
  /** Icon-only 44px trigger used by the phone editor toolbar. */
  compact?: boolean;
}) {
  const isPhone = useMediaQuery("(max-width: 767px)");
  const [open, setOpen] = useState(false);
  const [currentContent, setCurrentContent] = useState("");
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [selected, setSelected] = useState<Revision | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listChapterRevisions(chapterId);
        if (!cancelled) {
          setRevisions(rows);
          setSelected(rows[0] ?? null);
        }
      } catch {
        if (!cancelled) setError("Could not load the history");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, chapterId]);

  function restore(revision: Revision) {
    setError(null);
    startTransition(async () => {
      try {
        // Unsaved keystrokes must reach the server before the snapshot happens.
        if (!(await flush())) {
          setError("Save the chapter or resolve its conflict before restoring a revision");
          return;
        }
        const result = await restoreChapterRevision(chapterId, revision.id);
        if (result.ok) {
          onRestored(revision.content, result.version);
          setOpen(false);
        } else {
          setError("Could not restore this revision");
        }
      } catch {
        setError("Could not restore this revision");
      }
    });
  }

  const diff = selected ? wordDiff(currentContent, selected.content) : [];

  function changeOpen(next: boolean) {
    // Snapshot the doc at open time — an event handler, not an effect, so
    // there is no render cascade and the diff base is stable for the visit.
    if (next) setCurrentContent(getCurrentContent());
    setOpen(next);
    if (!next) {
      setRevisions(null);
      setSelected(null);
      setError(null);
    }
  }

  const historyBody = (
    <>
      {revisions === null && !error ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Loading history…
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="py-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {revisions?.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          No snapshots yet — the history fills in as you write and edit.
        </p>
      ) : null}

      {revisions && revisions.length > 0 ? (
        <div className="grid min-h-0 gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
          <ul
            aria-label="Revisions"
            className="max-h-[32dvh] space-y-1 overflow-y-auto pr-1 text-sm sm:max-h-[50dvh]"
          >
            {revisions.map((revision) => (
              <li key={revision.id}>
                <button
                  type="button"
                  onClick={() => setSelected(revision)}
                  aria-pressed={selected?.id === revision.id}
                  className={cn(
                    "min-h-11 w-full rounded-sm px-3 py-2 text-left transition-colors sm:min-h-0 sm:px-2 sm:py-1.5",
                    selected?.id === revision.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/60",
                  )}
                >
                  <span className="block font-medium">{revisionSourceLabel(revision.source)}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {timestamp(revision.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex min-h-0 flex-col gap-3">
            <div
              aria-label="Difference against the current text"
              tabIndex={0}
              className="max-h-[42dvh] overflow-y-auto rounded-sm border border-border bg-muted/30 p-3 font-serif text-sm leading-relaxed sm:max-h-[44dvh]"
            >
              {diff.map((part, i) =>
                part.type === "same" ? (
                  <span key={i}>{part.text}</span>
                ) : part.type === "del" ? (
                  // Deleted relative to the revision = present today only.
                  <del key={i} className="bg-destructive/15 text-destructive no-underline">
                    {part.text}
                  </del>
                ) : (
                  <ins key={i} className="bg-ai-soft text-ai no-underline">
                    {part.text}
                  </ins>
                ),
              )}
            </div>
            {selected ? (
              <Button
                onClick={() => restore(selected)}
                disabled={pending}
                className="min-h-11 self-stretch sm:min-h-0 sm:self-end"
              >
                {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                {pending ? "Restoring…" : "Restore this version"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={compact ? "icon-lg" : "sm"}
        aria-label="Chapter history"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(compact && "size-11 rounded-sm text-muted-foreground hover:text-foreground")}
        onClick={() => changeOpen(true)}
      >
        <History aria-hidden="true" className="size-3.5" />
        {compact ? null : "History"}
      </Button>

      {isPhone ? (
        <Sheet open={open} onOpenChange={changeOpen}>
          <SheetContent
            side="right"
            className="h-dvh w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
          >
            <SheetHeader className="shrink-0 border-b border-border px-4 pb-3 pr-14">
              <SheetTitle>Chapter history</SheetTitle>
              <SheetDescription>
                Saved snapshots of this chapter. Restoring keeps a copy of today&rsquo;s text.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{historyBody}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={changeOpen}>
          <DialogContent className="max-h-[80dvh] sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Chapter history</DialogTitle>
              <DialogDescription>
                Saved snapshots of this chapter. Restoring keeps a copy of today&rsquo;s text, so
                nothing is lost by looking around.
              </DialogDescription>
            </DialogHeader>
            {historyBody}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

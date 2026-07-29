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
  DialogTrigger,
} from "@/components/ui/dialog";
import { listChapterRevisions, restoreChapterRevision } from "@/lib/actions/chapters";
import { wordDiff } from "@/lib/editor/word-diff";

type Revision = {
  id: string;
  content: string;
  source: string;
  createdAt: Date;
};

const SOURCE_LABELS: Record<string, string> = {
  user: "Manual save",
  regenerate: "Before regeneration",
  "pre-restore": "Before a restore",
  suggestion: "Suggestion applied",
  workflow: "Generated",
};

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
  onRestored,
}: {
  chapterId: string;
  /** Called when the dialog opens; serializing the doc per keystroke would be waste. */
  getCurrentContent: () => string;
  onRestored: (content: string, version: number) => void;
}) {
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
      const result = await restoreChapterRevision(chapterId, revision.id);
      if (result.ok) {
        onRestored(revision.content, result.version);
        setOpen(false);
      } else {
        setError("Could not restore this revision");
      }
    });
  }

  const diff = selected ? wordDiff(currentContent, selected.content) : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Snapshot the doc at open time — an event handler, not an effect, so
        // there is no render cascade and the diff base is stable for the visit.
        if (next) setCurrentContent(getCurrentContent());
        setOpen(next);
        if (!next) {
          setRevisions(null);
          setSelected(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label="Chapter history" />}>
        <History aria-hidden="true" className="size-3.5" />
        History
      </DialogTrigger>
      <DialogContent className="max-h-[80dvh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chapter history</DialogTitle>
          <DialogDescription>
            Saved snapshots of this chapter. Restoring keeps a copy of today&rsquo;s text, so
            nothing is lost by looking around.
          </DialogDescription>
        </DialogHeader>

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
              className="max-h-[50dvh] space-y-1 overflow-y-auto pr-1 text-sm"
            >
              {revisions.map((revision) => (
                <li key={revision.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(revision)}
                    aria-pressed={selected?.id === revision.id}
                    className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                      selected?.id === revision.id
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/60"
                    }`}
                  >
                    <span className="block font-medium">
                      {SOURCE_LABELS[revision.source] ?? revision.source}
                    </span>
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
                className="max-h-[44dvh] overflow-y-auto rounded-md border border-border bg-muted/30 p-3 font-serif text-sm leading-relaxed"
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
                <Button onClick={() => restore(selected)} disabled={pending} className="self-end">
                  {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                  {pending ? "Restoring…" : "Restore this version"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BookOutline } from "@/ai/schemas";
import { saveOutline } from "@/lib/actions/outline";

/**
 * Author editing for the outline's chapter titles and summaries — the fields
 * regeneration actually reads. Structural fields (hooks, arcs, key events)
 * stay as the agents wrote them; a save appends a new outline version with
 * source "user", never overwriting the original.
 */
export function OutlineEditor({ projectId, outline }: { projectId: string; outline: BookOutline }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(outline);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setDraft(outline);
          setEditing(true);
        }}
      >
        <Pencil aria-hidden="true" className="size-3.5" />
        Edit the outline
      </Button>
    );
  }

  function patchChapter(index: number, patch: Partial<BookOutline["chapters"][number]>) {
    setDraft((prev) => ({
      ...prev,
      chapters: prev.chapters.map((chapter, i) =>
        i === index ? { ...chapter, ...patch } : chapter,
      ),
    }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await saveOutline(projectId, draft);
        setEditing(false);
      } catch (cause) {
        setError(
          cause instanceof Error && cause.message.includes("current run")
            ? cause.message
            : "Could not save the outline — try again.",
        );
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        Edits apply to future writing — regenerating a chapter follows the outline you leave here.
        The agents&rsquo; original version stays in the outline history.
      </p>
      <ol className="space-y-4">
        {draft.chapters.map((chapter, index) => (
          <li key={chapter.number} className="space-y-1.5">
            <label
              htmlFor={`ol-title-${chapter.number}`}
              className="font-mono text-xs text-muted-foreground"
            >
              Chapter {chapter.number}
            </label>
            <Input
              id={`ol-title-${chapter.number}`}
              value={chapter.title}
              maxLength={300}
              onChange={(event) => patchChapter(index, { title: event.target.value })}
            />
            <Textarea
              aria-label={`Chapter ${chapter.number} summary`}
              value={chapter.summary}
              rows={3}
              maxLength={2000}
              onChange={(event) => patchChapter(index, { summary: event.target.value })}
            />
          </li>
        ))}
      </ol>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save outline"}
        </Button>
        <Button variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

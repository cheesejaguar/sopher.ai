"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Sticky approval bar shown while the run is paused on outline approval.
 * Approve resumes the run; request-changes sends notes back to the Outliner
 * and the run revises before drafting. Either way we return to the write view.
 */
export function OutlineApprovalBar({ runId, projectId }: { runId: string; projectId: string }) {
  const router = useRouter();
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState<"approve" | "revise" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(approved: boolean) {
    setPending(approved ? "approve" : "revise");
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "outline-approval",
          approved,
          ...(approved ? {} : { notes: notes.trim() || undefined }),
        }),
      });
      if (res.status === 409) {
        setError("This run is no longer waiting for approval.");
        return;
      }
      if (!res.ok) throw new Error(`Input rejected (${res.status})`);
      router.push(`/projects/${projectId}/write`);
    } catch {
      setError("Couldn't send your decision. Try again in a moment.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="sticky bottom-4 z-10 rounded-xl bg-popover p-4 shadow-lg ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Writing is paused for your approval.</p>
          <p className="text-xs text-muted-foreground">
            Approve the outline to start the chapters, or send notes for a revision.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setNotesOpen((open) => !open)}
            disabled={pending !== null}
            aria-expanded={notesOpen}
            aria-controls="outline-notes-panel"
          >
            <MessageSquareText aria-hidden="true" data-icon="inline-start" />
            Request changes
          </Button>
          <Button onClick={() => submit(true)} disabled={pending !== null}>
            {pending === "approve" ? (
              <Spinner />
            ) : (
              <Check aria-hidden="true" data-icon="inline-start" />
            )}
            Approve outline
          </Button>
        </div>
      </div>

      {notesOpen ? (
        <div id="outline-notes-panel" className="mt-3 space-y-2">
          <Label htmlFor="outline-notes">What should the Outliner change?</Label>
          <Textarea
            id="outline-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={5_000}
            rows={4}
            placeholder="e.g. Merge chapters 3 and 4, and give the archivist a chapter of her own before the midpoint."
          />
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={() => submit(false)}
              disabled={pending !== null || notes.trim().length === 0}
            >
              {pending === "revise" ? <Spinner /> : null}
              Send notes and revise
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

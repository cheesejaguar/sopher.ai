"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateProject } from "@/lib/actions/projects";

/**
 * In-place editing for the brief. The brief seeds future generation runs, so
 * edits matter even after a book exists — a re-run reads the new text.
 */
export function BriefEditor({ projectId, brief }: { projectId: string; brief: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        <Pencil aria-hidden="true" className="size-3.5" />
        Edit the brief
      </Button>
    );
  }

  function submit(formData: FormData) {
    setError(null);
    const next = String(formData.get("brief") ?? "").trim();
    if (next.length < 20) {
      setError("A brief needs at least 20 characters.");
      return;
    }
    startTransition(async () => {
      try {
        await updateProject(projectId, { brief: next });
        setEditing(false);
      } catch {
        setError("Could not save — try again.");
      }
    });
  }

  return (
    <form action={submit} className="space-y-3">
      <label htmlFor="brief-editor" className="sr-only">
        Brief
      </label>
      <Textarea
        id="brief-editor"
        name="brief"
        defaultValue={brief}
        rows={10}
        maxLength={20_000}
        className="font-serif"
        autoFocus
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save brief"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Changes apply to future generation runs — chapters already written stay as they are.
      </p>
    </form>
  );
}

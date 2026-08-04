"use client";

import { useId, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { FileUp, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ImportCommitResponse, ImportPreviewResponse } from "@/lib/import";

/**
 * "I already have a draft" — the second way into Studio.
 *
 * The upload is previewed before anything is written: the author sees the exact
 * chapter table the parser found and confirms it. Detection is deterministic,
 * so the commit that follows re-reads the same file and produces the same
 * split — the preview is a promise, not an estimate. Nothing here costs
 * credits, and the copy says so, because "upload a file" next to a credit
 * balance reads as a charge until proven otherwise.
 */

const ACCEPTED = ".docx,.md,.markdown,.txt";

type Stage =
  | { step: "choose" }
  | { step: "reading" }
  | { step: "confirm"; preview: ImportPreviewResponse }
  | { step: "writing"; preview: ImportPreviewResponse };

function wordCount(words: number): string {
  return words.toLocaleString();
}

export function ImportDialog({ trigger }: { trigger?: ReactElement }) {
  const router = useRouter();
  const titleId = useId();
  const genreId = useId();
  const fileId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  /** Stable for the life of one chosen file, so a retried commit is a replay. */
  const requestKey = useRef<string>("");
  const chosen = useRef<File | null>(null);

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ step: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");

  const busy = stage.step === "reading" || stage.step === "writing";

  function reset() {
    setStage({ step: "choose" });
    setError(null);
    setTitle("");
    setGenre("");
    chosen.current = null;
    requestKey.current = "";
    if (fileInput.current) fileInput.current.value = "";
  }

  async function send<T>(mode: "preview" | "commit"): Promise<T | null> {
    const file = chosen.current;
    if (!file) return null;
    const body = new FormData();
    body.set("file", file);
    body.set("mode", mode);
    if (mode === "commit") {
      body.set("requestKey", requestKey.current);
      body.set("title", title.trim());
      if (genre.trim()) body.set("genre", genre.trim());
    }

    const response = await fetch("/api/projects/import", { method: "POST", body });
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    if (!response.ok) {
      setError(
        typeof payload?.error === "string"
          ? payload.error
          : "That file could not be read. Try a .docx, .md or .txt export of your draft.",
      );
      return null;
    }
    return payload as T;
  }

  async function preview(file: File) {
    chosen.current = file;
    requestKey.current = crypto.randomUUID();
    setError(null);
    setStage({ step: "reading" });
    try {
      const payload = await send<ImportPreviewResponse>("preview");
      if (!payload) {
        setStage({ step: "choose" });
        return;
      }
      setTitle(payload.title);
      setStage({ step: "confirm", preview: payload });
    } catch {
      setError("The upload did not finish. Check your connection and try again.");
      setStage({ step: "choose" });
    }
  }

  async function commit(preview: ImportPreviewResponse) {
    setError(null);
    setStage({ step: "writing", preview });
    try {
      const payload = await send<ImportCommitResponse>("commit");
      if (!payload) {
        setStage({ step: "confirm", preview });
        return;
      }
      setOpen(false);
      router.push(`/projects/${payload.projectId}/manuscript` as Route);
      router.refresh();
    } catch {
      setError("The manuscript was not saved. Nothing was created — try again.");
      setStage({ step: "confirm", preview });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="outline" className="rounded-sm">
              <FileUp aria-hidden="true" data-icon="inline-start" />
              Import a draft
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import a draft</DialogTitle>
          <DialogDescription>
            Bring a manuscript you have already written. We split it into chapters and open it in
            Studio — no credits are used.
          </DialogDescription>
        </DialogHeader>

        {stage.step === "choose" || stage.step === "reading" ? (
          <div className="space-y-3">
            <Label htmlFor={fileId}>Manuscript file</Label>
            <Input
              ref={fileInput}
              id={fileId}
              type="file"
              accept={ACCEPTED}
              aria-describedby={`${fileId}-hint`}
              className="min-h-11 py-2 sm:min-h-9"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void preview(file);
              }}
            />
            <p id={`${fileId}-hint`} className="text-xs text-muted-foreground">
              Word (.docx), Markdown (.md) or plain text (.txt), up to 4 MB. Chapters are found from
              your own headings — “Chapter One”, a Word Heading style, or a page break.
            </p>
          </div>
        ) : null}

        {stage.step === "confirm" || stage.step === "writing" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={titleId}>Title</Label>
                <Input
                  id={titleId}
                  value={title}
                  maxLength={200}
                  required
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={genreId}>Genre (optional)</Label>
                <Input
                  id={genreId}
                  value={genre}
                  maxLength={60}
                  placeholder="Literary fiction"
                  onChange={(event) => setGenre(event.target.value)}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-sm border border-border">
              <div className="flex items-baseline justify-between border-b border-border bg-muted/45 px-3 py-2">
                <p className="text-sm font-medium">
                  {stage.preview.chapters.length}{" "}
                  {stage.preview.chapters.length === 1 ? "chapter" : "chapters"}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {wordCount(stage.preview.totalWords)} words
                </p>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Chapters found in your file, in the order they will be created
                  </caption>
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">Number</th>
                      <th scope="col">Title</th>
                      <th scope="col">Words</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stage.preview.chapters.map((chapter) => (
                      <tr key={chapter.number} className="border-b border-border/60 last:border-0">
                        <td className="w-10 px-3 py-1.5 font-mono text-xs text-muted-foreground">
                          {chapter.number}
                        </td>
                        <td className="px-1 py-1.5">
                          {chapter.title ?? (
                            <span className="text-muted-foreground">Chapter {chapter.number}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                          {wordCount(chapter.wordCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {stage.preview.skipped.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Kept as book matter rather than chapters: {stage.preview.skipped.join(", ")}.
              </p>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Not the split you expected? Close this, add a heading to each chapter, and import
              again — nothing has been saved yet.
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <p aria-live="polite" className="sr-only">
          {stage.step === "reading"
            ? "Reading your manuscript"
            : stage.step === "writing"
              ? "Creating your book"
              : stage.step === "confirm"
                ? `Found ${stage.preview.chapters.length} chapters`
                : ""}
        </p>

        <DialogFooter>
          {stage.step === "confirm" || stage.step === "writing" ? (
            <>
              <Button
                type="button"
                variant="outline"
                aria-disabled={busy}
                onClick={() => {
                  if (!busy) reset();
                }}
              >
                Choose another file
              </Button>
              <Button
                type="button"
                aria-busy={busy || undefined}
                aria-disabled={busy || title.trim().length === 0}
                onClick={() => {
                  if (busy || !title.trim()) return;
                  void commit(stage.preview);
                }}
              >
                <Upload aria-hidden="true" data-icon="inline-start" />
                {stage.step === "writing" ? "Creating…" : "Create this book"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              aria-busy={busy || undefined}
              aria-disabled={busy}
              onClick={() => {
                if (busy) return;
                setOpen(false);
                reset();
              }}
            >
              {stage.step === "reading" ? "Reading your manuscript…" : "Cancel"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

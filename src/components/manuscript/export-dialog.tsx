"use client";

import * as React from "react";
import { BookOpenText, Download, FileDown, FileText, FileType2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

type ExportFormat = "md" | "docx" | "epub" | "pdf";

const FORMATS: {
  id: ExportFormat;
  name: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "md", name: "Markdown", blurb: "Best for editing anywhere plain text goes", icon: FileText },
  { id: "docx", name: "Word", blurb: "Best for Word, Google Docs, and human editors", icon: FileType2 },
  { id: "epub", name: "EPUB", blurb: "Best for Kindle, Kobo, and Apple Books", icon: BookOpenText },
  { id: "pdf", name: "PDF", blurb: "Best for print-ready proofs and sharing", icon: FileDown },
];

const POLL_MS = 2_000;
const MAX_POLLS = 30; // 60s ceiling

type Phase =
  | { name: "idle" }
  | { name: "working"; format: ExportFormat }
  | { name: "done"; format: ExportFormat; asset: { id: string; filename: string } }
  | { name: "failed"; format: ExportFormat; message: string };

export function ExportDialog({ projectId }: { projectId: string }) {
  const [phase, setPhase] = React.useState<Phase>({ name: "idle" });
  const generation = React.useRef(0);

  React.useEffect(() => {
    const current = generation;
    return () => {
      current.current += 1; // cancel any in-flight poll loop on unmount
    };
  }, []);

  async function beginExport(format: ExportFormat) {
    const ticket = ++generation.current;
    setPhase({ name: "working", format });
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      if (res.status === 409) {
        throw new Error("Another export is still running — give it a moment.");
      }
      if (!res.ok) throw new Error("The export could not be started.");
      const { runId } = (await res.json()) as { runId: string };

      for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (generation.current !== ticket) return;
        const poll = await fetch(`/api/projects/${projectId}/export?runId=${runId}`);
        if (!poll.ok) continue;
        const body = (await poll.json()) as {
          status: string;
          error: string | null;
          asset: { id: string; filename: string } | null;
        };
        if (generation.current !== ticket) return;
        if (body.status === "completed" && body.asset) {
          setPhase({ name: "done", format, asset: body.asset });
          toast.success(`${body.asset.filename} is ready to download`);
          return;
        }
        if (body.status === "failed" || body.status === "cancelled") {
          throw new Error(body.error ?? "The export did not finish.");
        }
      }
      throw new Error("The export timed out. It may still finish — try again shortly.");
    } catch (error) {
      if (generation.current !== ticket) return;
      const message = error instanceof Error ? error.message : "The export did not finish.";
      setPhase({ name: "failed", format, message });
    }
  }

  const busy = phase.name === "working";

  return (
    <Dialog>
      <Toaster />
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Download data-icon="inline-start" />
        Export
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export the manuscript</DialogTitle>
          <DialogDescription>
            Assembles every finished chapter into a single file. Takes a few seconds.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Export formats">
          {FORMATS.map((format) => {
            const Icon = format.icon;
            const isActive =
              phase.name !== "idle" && "format" in phase && phase.format === format.id;
            return (
              <button
                key={format.id}
                type="button"
                disabled={busy}
                onClick={() => beginExport(format.id)}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
                  "hover:border-primary/50 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                  "disabled:pointer-events-none disabled:opacity-50",
                  isActive && "border-primary bg-accent",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {isActive && phase.name === "working" ? (
                    <Spinner className="size-4" />
                  ) : (
                    <Icon className="size-4 text-muted-foreground" />
                  )}
                  {format.name}
                </span>
                <span className="text-xs text-muted-foreground">{format.blurb}</span>
              </button>
            );
          })}
        </div>

        <div aria-live="polite">
          {phase.name === "working" ? (
            <p className="text-xs text-muted-foreground">
              Binding the {FORMATS.find((f) => f.id === phase.format)?.name} edition…
            </p>
          ) : null}

          {phase.name === "done" ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-accent p-3">
              <p className="min-w-0 truncate font-mono text-xs">{phase.asset.filename}</p>
              <Button size="sm" render={<a href={`/api/exports/${phase.asset.id}`} />}>
                <Download data-icon="inline-start" />
                Download
              </Button>
            </div>
          ) : null}

          {phase.name === "failed" ? (
            <div className="space-y-2 rounded-lg bg-destructive/10 p-3">
              <p className="text-xs text-destructive">{phase.message}</p>
              <Button variant="outline" size="xs" onClick={() => beginExport(phase.format)}>
                <RefreshCw data-icon="inline-start" />
                Try again
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

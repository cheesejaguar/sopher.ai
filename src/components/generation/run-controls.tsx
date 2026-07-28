"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { RunConnection } from "@/hooks/use-run-stream";

const CONNECTION_LABELS: Record<RunConnection, string> = {
  connecting: "connecting",
  live: "live",
  reconnecting: "reconnecting",
  ended: "ended",
};

/**
 * Cancel is the only control — the workflow has no pause, so none is offered.
 * The connection chip reflects the real state of the event stream.
 */
export function RunControls({
  projectId,
  connection,
  onCancelled,
}: {
  projectId: string;
  connection: RunConnection;
  onCancelled: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function cancelRun() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Cancel failed (${res.status})`);
      }
      setOpen(false);
      onCancelled();
    } catch {
      setError("Couldn't stop the run. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs",
          connection === "live" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            connection === "live" && "bg-ai motion-safe:animate-pulse",
            connection === "reconnecting" && "bg-ember motion-safe:animate-pulse",
            connection === "connecting" && "bg-muted-foreground motion-safe:animate-pulse",
            connection === "ended" && "bg-muted-foreground/50",
          )}
        />
        {CONNECTION_LABELS[connection]}
      </span>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          render={<Button variant="destructive" size="sm" />}
          disabled={connection === "ended"}
        >
          Stop the run
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Stop writing this book?</AlertDialogTitle>
            <AlertDialogDescription>
              The run stops where it is. Chapters already drafted stay saved, and you can start a
              fresh run any time — but this one can&apos;t be resumed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep writing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={cancelRun}>
              {pending ? <Spinner /> : null}
              Stop the run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

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
  runId,
  connection,
  cancellationRequested = false,
  onCancelled,
}: {
  projectId: string;
  runId: string;
  connection: RunConnection;
  cancellationRequested?: boolean;
  onCancelled: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function cancelRun() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(
          typeof body?.error === "string" ? body.error : `Cancel failed (${res.status})`,
        );
      }
      setOpen(false);
      onCancelled();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't stop the run. Try again in a moment.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      {/* The dot is decorative; the word carries the state, and role="status"
          means a drop to "reconnecting" is announced once, politely. */}
      <span
        role="status"
        className={cn(
          "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs",
          connection === "live" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="sr-only">Connection: </span>
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            connection === "live" && "bg-ai",
            connection === "reconnecting" && "bg-ember",
            connection === "connecting" && "bg-muted-foreground",
            connection === "ended" && "bg-muted-foreground/50",
          )}
        />
        {CONNECTION_LABELS[connection]}
      </span>

      {cancellationRequested ? (
        <Button variant="outline" size="sm" disabled>
          <Spinner aria-hidden="true" />
          Stopping safely
        </Button>
      ) : (
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
                The studio will stop safely before another model call or manuscript commit. Saved
                work and settled costs remain recorded. Once stopping is confirmed, the Next step
                will show any recovery options available for this book.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Keep writing</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={pending} onClick={cancelRun}>
                {pending ? <Spinner /> : null}
                Stop the run
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

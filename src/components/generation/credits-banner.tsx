"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Shown on the write screen while the run is suspended for credits.
 *
 * Everything drafted so far is durable — the workflow is parked on a hook, so
 * resuming continues from the next wave without re-billing anything. "Resume"
 * posts the top-up input; the server re-checks the balance and refuses (402)
 * if nothing was actually added.
 */
export function CreditsBanner({
  projectId,
  runId,
  detail,
}: {
  projectId: string;
  runId: string;
  detail?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resume() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${runId}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "credits-topup" }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(
          response.status === 402
            ? "Your balance is still empty — add credits first."
            : (body.error ?? "Could not resume the run"),
        );
        return;
      }
      // The run stream picks the resume up on its own; nothing to navigate.
    } catch {
      setError("Could not resume the run");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-sm border border-ember/40 bg-ember/5 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Wallet aria-hidden="true" className="size-4 shrink-0 text-ember" />
          <div>
            <p className="text-sm font-medium">Writing is paused — out of credits.</p>
            <p className="text-xs text-muted-foreground">
              {detail ? `${detail}. ` : ""}Every chapter drafted so far is safe; the book continues
              exactly where it stopped once you top up.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            render={
              <Link
                href={`/studio/credits?return=${encodeURIComponent(`/projects/${projectId}/write`)}`}
              />
            }
            nativeButton={false}
          >
            Add credits
          </Button>
          <Button onClick={resume} disabled={busy}>
            {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {busy ? "Resuming…" : "Resume writing"}
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

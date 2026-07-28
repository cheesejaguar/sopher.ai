"use client";

import * as React from "react";
import { BookOpenText, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { RunViewer } from "@/components/generation/run-viewer";
import type { RunSnapshot } from "@/hooks/use-run-stream";
import { TIER_LABELS, type QualityTier } from "@/ai/models";

function words(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * Client island for the write stage: pre-flight when the project has never
 * run, the live run viewer otherwise. Starting a run swaps straight into the
 * live view with a fresh snapshot — no reload required.
 */
export function WriteExperience({
  projectId,
  projectTitle,
  tier,
  requireOutlineApproval,
  targetChapters,
  targetWordsPerChapter,
  estimateUsd,
  estimatedMinutes,
  initialSnapshot,
  titles,
}: {
  projectId: string;
  projectTitle: string;
  tier: QualityTier;
  requireOutlineApproval: boolean;
  targetChapters: number;
  targetWordsPerChapter: number;
  estimateUsd: number;
  estimatedMinutes: number;
  initialSnapshot: RunSnapshot | null;
  titles: Record<number, string | null>;
}) {
  const [snapshot, setSnapshot] = React.useState<RunSnapshot | null>(initialSnapshot);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function startRun() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, requireOutlineApproval }),
      });
      const json: unknown = await res.json().catch(() => null);
      const runId = (json as { runId?: string } | null)?.runId;
      if ((res.status === 202 || res.status === 409) && runId) {
        // 409 means a run is already active — attach to it instead of erroring.
        setSnapshot({
          run: { id: runId, status: res.status === 202 ? "queued" : "running", error: null },
          events: [],
          chapters: [],
          totalUsd: 0,
        });
      } else if (res.status === 401) {
        setError("You need to be signed in to start a run.");
      } else {
        const message = (json as { error?: unknown } | null)?.error;
        setError(
          typeof message === "string" ? message : "Couldn't start the run. Try again in a moment.",
        );
      }
    } catch {
      setError("Couldn't reach the studio. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (!snapshot) {
    return (
      <PreFlight
        tier={tier}
        requireOutlineApproval={requireOutlineApproval}
        targetChapters={targetChapters}
        targetWordsPerChapter={targetWordsPerChapter}
        estimateUsd={estimateUsd}
        estimatedMinutes={estimatedMinutes}
        onStart={startRun}
        pending={pending}
        error={error}
      />
    );
  }

  return (
    <RunViewer
      key={snapshot.run.id}
      runId={snapshot.run.id}
      projectId={projectId}
      projectTitle={projectTitle}
      snapshot={snapshot}
      titles={titles}
      tier={tier}
      estimateUsd={estimateUsd}
      plannedChapters={targetChapters}
      onRestart={startRun}
      restartPending={pending}
      restartError={error}
    />
  );
}

function PreFlight({
  tier,
  requireOutlineApproval,
  targetChapters,
  targetWordsPerChapter,
  estimateUsd,
  estimatedMinutes,
  onStart,
  pending,
  error,
}: {
  tier: QualityTier;
  requireOutlineApproval: boolean;
  targetChapters: number;
  targetWordsPerChapter: number;
  estimateUsd: number;
  estimatedMinutes: number;
  onStart: () => void;
  pending: boolean;
  error: string | null;
}) {
  const tierLabel = TIER_LABELS[tier];
  const facts = [
    { label: "Chapters", value: String(targetChapters) },
    { label: "Words per chapter", value: `~${words(targetWordsPerChapter)}` },
    { label: "Target length", value: `~${words(targetChapters * targetWordsPerChapter)} words` },
    { label: "Quality tier", value: tierLabel.name },
  ];

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="rounded-xl bg-card px-6 py-8 ring-1 ring-foreground/10 sm:px-8">
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          Pre-flight
        </p>
        <h3 className="mt-3 font-display text-xl font-semibold tracking-tight text-balance">
          Everything&apos;s set. The writers are waiting on you.
        </h3>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {tierLabel.name} tier — {tierLabel.blurb.toLowerCase()}.{" "}
          {requireOutlineApproval
            ? "The run pauses after the outline so you can approve it before any chapters are written."
            : "The run goes straight from outline to chapters without stopping."}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="mt-0.5 font-mono text-sm font-medium tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onStart} disabled={pending}>
            {pending ? <Spinner /> : <PenLine aria-hidden="true" data-icon="inline-start" />}
            Start writing this book
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </section>

      <section
        aria-label="Cost estimate"
        className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10"
      >
        <div className="flex items-center gap-2">
          <BookOpenText aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <h4 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Estimate
          </h4>
        </div>
        <p className="mt-2 font-mono text-2xl font-medium tabular-nums">
          ${estimateUsd.toFixed(2)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          ±30%, metered as the agents work · about {estimatedMinutes} min
        </p>
      </section>
    </div>
  );
}

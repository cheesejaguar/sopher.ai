"use client";

import * as React from "react";
import { BookOpenText, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { RunViewer } from "@/components/generation/run-viewer";
import { CostDisplay } from "@/components/studio/product-primitives";
import type { RunSnapshot } from "@/hooks/use-run-stream";
import { TIER_LABELS, type QualityTier } from "@/ai/models";
import { creditsForUsd } from "@/lib/billing/credits-shared";

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

  // Starting (or restarting) a run unmounts the button that was just pressed,
  // which would drop keyboard focus to <body>. Move it into the live view
  // instead so the tab order continues from where the user was. — WCAG 2.4.3
  const runRef = React.useRef<HTMLDivElement | null>(null);
  const moveFocusToRun = React.useRef(false);

  React.useEffect(() => {
    if (snapshot && moveFocusToRun.current) {
      moveFocusToRun.current = false;
      runRef.current?.focus();
    }
  }, [snapshot]);

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
        moveFocusToRun.current = true;
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
    <div ref={runRef} tabIndex={-1}>
      <RunViewer
        key={snapshot.run.id}
        runId={snapshot.run.id}
        runKind={snapshot.run.kind ?? "full_book"}
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
    </div>
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
    <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <section className="instrument-surface-raised relative overflow-hidden rounded-sm px-5 py-7 sm:px-8 sm:py-9">
        <span aria-hidden="true" className="spectral-rule absolute inset-y-0 left-0 w-px" />
        <p className="folio-label text-primary">Production ready</p>
        <h3 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-balance sm:text-2xl">
          Everything&apos;s set. The writers are waiting on you.
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {tierLabel.name} tier — {tierLabel.blurb.toLowerCase()}.{" "}
          {requireOutlineApproval
            ? "The run pauses after the outline so you can approve it before any chapters are written."
            : "The run goes straight from outline to chapters without stopping."}
        </p>

        <dl className="mt-7 grid grid-cols-2 border-y border-border sm:grid-cols-4">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="border-r border-border px-3 py-4 first:pl-0 last:border-r-0"
            >
              <dt className="folio-label text-muted-foreground">{fact.label}</dt>
              <dd className="mt-2 font-mono text-sm font-medium tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onStart} disabled={pending}>
            {pending ? <Spinner /> : <PenLine aria-hidden="true" data-icon="inline-start" />}
            Start writing this book
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      <section aria-label="Cost estimate" className="instrument-surface rounded-sm p-5">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <BookOpenText aria-hidden="true" className="size-3.5 text-primary" />
          <h4 className="folio-label text-muted-foreground">Credit quote</h4>
        </div>
        <CostDisplay
          className="mt-5"
          credits={creditsForUsd(estimateUsd)}
          usd={estimateUsd}
          note={`±30%, metered as the agents work · about ${estimatedMinutes} min`}
        />
      </section>
    </div>
  );
}

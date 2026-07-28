"use client";

import * as React from "react";
import { CircleAlert, OctagonX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FolioRail } from "@/components/studio/folio-rail";
import { useRunStream, type RunSnapshot } from "@/hooks/use-run-stream";
import { StageTimeline } from "@/components/generation/stage-timeline";
import { LiveDraftPane } from "@/components/generation/live-draft-pane";
import { AgentFeed } from "@/components/generation/agent-feed";
import { CostTicker } from "@/components/generation/cost-ticker";
import { RunControls } from "@/components/generation/run-controls";
import { ApprovalBanner } from "@/components/generation/approval-banner";
import { CompletionMoment } from "@/components/generation/completion-moment";
import type { QualityTier } from "@/ai/models";

/**
 * The live run experience. Every visual state derives from actual run events
 * (or the persisted snapshot of them) — no synthetic progress, no invented
 * ETAs. Key this component by runId so hook state resets per run.
 */
export function RunViewer({
  runId,
  projectId,
  projectTitle,
  snapshot,
  titles,
  tier,
  estimateUsd,
  plannedChapters,
  onRestart,
  restartPending,
  restartError,
}: {
  runId: string;
  projectId: string;
  projectTitle: string;
  snapshot: RunSnapshot;
  titles: Record<number, string | null>;
  tier: QualityTier;
  estimateUsd: number;
  plannedChapters: number;
  onRestart: () => void;
  restartPending: boolean;
  restartError: string | null;
}) {
  const { state, subscribeChapterProse, markCancelled } = useRunStream(runId, snapshot);

  const railChapters = React.useMemo(
    () =>
      [...state.chapters.entries()]
        .sort(([a], [b]) => a - b)
        .map(([number, ch]) => ({ number, status: ch.status })),
    [state.chapters],
  );
  const draftingCount = railChapters.filter((c) => c.status === "drafting").length;
  const plannedTotal = Math.max(railChapters.length, plannedChapters);

  if (state.stage === "done") {
    return (
      <CompletionMoment
        projectId={projectId}
        projectTitle={projectTitle}
        chapterCount={railChapters.length > 0 ? railChapters.length : plannedChapters}
        recommendation={state.detail}
        review={
          state.review
            ? { score: state.review.score, issueCount: state.review.issueCount }
            : undefined
        }
      />
    );
  }

  if (state.stage === "failed") {
    return (
      <EndCard
        icon={<CircleAlert aria-hidden="true" className="size-5 text-destructive" />}
        title="The run hit a wall."
        body={
          state.error?.message ??
          "Something went wrong while writing. Chapters already drafted are saved."
        }
        actionLabel="Try again"
        onAction={onRestart}
        pending={restartPending}
        error={restartError}
      />
    );
  }

  if (state.stage === "cancelled") {
    return (
      <EndCard
        icon={<OctagonX aria-hidden="true" className="size-5 text-muted-foreground" />}
        title="You stopped this run."
        body="Everything drafted before the stop is saved. A new run starts fresh from the brief."
        actionLabel="Start a new run"
        onAction={onRestart}
        pending={restartPending}
        error={restartError}
      />
    );
  }

  return (
    <div className="space-y-4">
      <StageTimeline
        stage={state.stage}
        pct={state.pct}
        detail={state.detail}
        tier={tier}
        draftingCount={draftingCount}
        plannedTotal={plannedTotal}
      />

      {state.stage === "awaiting_approval" ? <ApprovalBanner projectId={projectId} /> : null}

      {state.error && !state.error.fatal ? (
        <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          {state.error.message}
        </p>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          {railChapters.length > 0 ? (
            <FolioRail chapters={railChapters} orientation="horizontal" className="flex-wrap" />
          ) : null}
          <LiveDraftPane
            chapters={state.chapters}
            titles={titles}
            stage={state.stage}
            subscribeChapterProse={subscribeChapterProse}
          />
        </div>

        <div className="space-y-4">
          <CostTicker totalUsd={state.totalUsd} estimateUsd={estimateUsd} />
          <AgentFeed items={state.agentFeed} connection={state.connection} />
          <RunControls
            projectId={projectId}
            connection={state.connection}
            onCancelled={markCancelled}
          />
        </div>
      </div>
    </div>
  );
}

function EndCard({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  pending,
  error,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-xl bg-card px-6 py-12 text-center ring-1 ring-foreground/10">
      {icon}
      <div className="space-y-1.5">
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{body}</p>
      </div>
      <Button onClick={onAction} disabled={pending}>
        {pending ? <Spinner /> : null}
        {actionLabel}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

"use client";

import * as React from "react";
import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRunStream, type RunSnapshot, type RunStreamState } from "@/hooks/use-run-stream";
import { StageTimeline } from "@/components/generation/stage-timeline";
import { BookAssembly } from "@/components/generation/book-assembly";
import { LiveDraftPane } from "@/components/generation/live-draft-pane";
import { AgentFeed } from "@/components/generation/agent-feed";
import { CostTicker } from "@/components/generation/cost-ticker";
import { RunControls } from "@/components/generation/run-controls";
import { ApprovalBanner } from "@/components/generation/approval-banner";
import { CreditsBanner } from "@/components/generation/credits-banner";
import { CompletionMoment } from "@/components/generation/completion-moment";
import { AsyncState, ResponsiveInspector } from "@/components/studio/product-primitives";
import type { Stage } from "@/lib/run-events";
import type { QualityTier } from "@/ai/models";

/**
 * One short sentence per stage. Deliberately excludes the percentage, the cost
 * ticker and the prose stream: those change many times a second and would turn
 * the live region into noise. Only stage changes (and the drafted-chapter
 * count) alter this string, so assistive tech hears each milestone once.
 */
function announcementFor(stage: Stage, draftedCount: number, plannedTotal: number): string {
  switch (stage) {
    case "queued":
      return "Run queued. Waiting for the agents to start.";
    case "concept":
      return "Developing the concept.";
    case "outline":
      return "Writing the outline.";
    case "awaiting_approval":
      return "Paused. The outline is ready for your approval.";
    case "bible":
      return "Building the story bible for every chapter.";
    case "chapters":
      return `Drafting chapters: ${draftedCount} of ${plannedTotal} done.`;
    case "awaiting_credits":
      return "Paused. Add credits to finish the book — drafted chapters are kept.";
    case "editing":
      return "Editing the chapters.";
    case "continuity":
      return "Checking continuity across the book.";
    case "revising":
      return "Revising against the continuity notes.";
    case "finalizing":
      return "Finishing the manuscript.";
    case "done":
      return "The book is written.";
    case "failed":
      return "The run failed.";
    case "cancelled":
      return "The run was stopped.";
  }
}

/**
 * The live run experience. Every visual state derives from actual run events
 * (or the persisted snapshot of them) — no synthetic progress, no invented
 * ETAs. Key this component by runId so hook state resets per run.
 */
export function RunViewer({
  runId,
  runKind = "full_book",
  projectId,
  projectTitle,
  snapshot,
  titles,
  tier,
  estimateUsd,
  plannedChapters,
  targetWordsPerChapter,
  onRestart,
  restartPending,
  restartError,
  onProgress,
}: {
  runId: string;
  /** Restart affordances re-run the FULL BOOK — hide them for scoped runs. */
  runKind?: "full_book" | "chapter" | "edit_pass" | "continuity" | "export";
  projectId: string;
  projectTitle: string;
  snapshot: RunSnapshot;
  titles: Record<number, string | null>;
  tier: QualityTier;
  estimateUsd: number;
  plannedChapters: number;
  targetWordsPerChapter: number;
  onRestart: () => void;
  restartPending: boolean;
  restartError: string | null;
  onProgress?: (progress: RunProgressSnapshot) => void;
}) {
  const { state, subscribeChapterProse, markCancelled } = useRunStream(runId, snapshot);
  const terminal =
    state.stage === "done" || state.stage === "failed" || state.stage === "cancelled";
  const runSurfaceRef = React.useRef<HTMLDivElement | null>(null);
  const focusWasInsideRef = React.useRef(false);
  const previousTerminalRef = React.useRef(terminal);

  const railChapters = React.useMemo(
    () =>
      [...state.chapters.entries()]
        .sort(([a], [b]) => a - b)
        .map(([number, ch]) => ({ number, status: ch.status })),
    [state.chapters],
  );
  const draftingCount = railChapters.filter((c) => c.status === "drafting").length;
  const draftedCount = railChapters.filter(
    (c) => c.status !== "planned" && c.status !== "drafting",
  ).length;
  const plannedTotal = Math.max(railChapters.length, plannedChapters);
  const announcement = announcementFor(state.stage, draftedCount, plannedTotal);

  React.useLayoutEffect(() => {
    if (!previousTerminalRef.current && terminal && focusWasInsideRef.current) {
      runSurfaceRef.current?.focus({ preventScroll: true });
    }
    previousTerminalRef.current = terminal;
  }, [terminal]);

  React.useEffect(() => {
    onProgress?.(
      projectProgressForRun(
        {
          stage: state.stage,
          pct: state.pct,
          detail: state.detail,
          pausedStage: state.pausedStage,
        },
        draftedCount,
        plannedTotal,
      ),
    );
  }, [
    draftedCount,
    onProgress,
    plannedTotal,
    state.detail,
    state.pausedStage,
    state.pct,
    state.stage,
  ]);

  let content: React.ReactNode;

  if (state.stage === "done") {
    content = (
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
        onWriteAgain={runKind === "full_book" ? onRestart : undefined}
        writeAgainPending={restartPending}
        writeAgainError={restartError}
      />
    );
  } else if (state.stage === "failed") {
    content = (
      <EndCard
        status="error"
        title="The run hit a wall."
        body={
          state.error?.message ??
          "Something went wrong while writing. Chapters already drafted are saved."
        }
        actionLabel={runKind === "full_book" ? "Try again" : undefined}
        onAction={runKind === "full_book" ? onRestart : undefined}
        pending={restartPending}
        error={restartError}
      />
    );
  } else if (state.stage === "cancelled") {
    content = (
      <EndCard
        status="empty"
        title="You stopped this run."
        body="Everything drafted before the stop is saved. Start again with the same production settings to keep that work; changed settings rebuild the book and preserve replaced prose in History."
        actionLabel={runKind === "full_book" ? "Start a new run" : undefined}
        onAction={runKind === "full_book" ? onRestart : undefined}
        pending={restartPending}
        error={restartError}
      />
    );
  } else {
    content = (
      <div className="space-y-4">
        <StageTimeline
          stage={state.stage}
          pct={state.pct}
          detail={state.detail}
          pausedStage={state.pausedStage}
          tier={tier}
          draftingCount={draftingCount}
          plannedTotal={plannedTotal}
        />

        {state.stage === "awaiting_approval" ? <ApprovalBanner projectId={projectId} /> : null}

        {state.stage === "awaiting_credits" ? (
          <CreditsBanner projectId={projectId} runId={runId} detail={state.detail} />
        ) : null}

        {state.error && !state.error.fatal ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
            {state.error.message}
          </p>
        ) : null}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-4">
            <BookAssembly
              chapters={state.chapters}
              titles={titles}
              plannedTotal={plannedTotal}
              targetWordsPerChapter={targetWordsPerChapter}
              stage={state.stage}
            />
            <LiveDraftPane
              chapters={state.chapters}
              titles={titles}
              stage={state.stage}
              subscribeChapterProse={subscribeChapterProse}
            />
          </div>

          <ResponsiveInspector
            title="Production inspector"
            description="Live credit use, agent notes, and run controls."
          >
            <CostTicker
              totalCredits={state.totalCredits}
              totalUsd={state.totalUsd}
              estimateUsd={estimateUsd}
            />
            <AgentFeed items={state.agentFeed} connection={state.connection} />
            <RunControls
              projectId={projectId}
              connection={state.connection}
              onCancelled={markCancelled}
            />
          </ResponsiveInspector>
        </div>
      </div>
    );
  }

  // The live region is mounted in every branch, so it exists before its text
  // ever changes: silent on first paint, one polite sentence per milestone.
  return (
    <div
      ref={runSurfaceRef}
      tabIndex={terminal ? -1 : undefined}
      role={terminal ? "region" : undefined}
      aria-label={
        terminal
          ? state.stage === "done"
            ? "Book generation complete"
            : state.stage === "failed"
              ? "Book generation failed"
              : "Book generation stopped"
          : undefined
      }
      onFocusCapture={() => {
        focusWasInsideRef.current = true;
      }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && !event.currentTarget.contains(next)) {
          focusWasInsideRef.current = false;
        } else if (next === null) {
          queueMicrotask(() => {
            const active = document.activeElement;
            if (active && !runSurfaceRef.current?.contains(active)) {
              focusWasInsideRef.current = false;
            }
          });
        }
      }}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {content}
    </div>
  );
}

export type RunProgressSnapshot = {
  stage: Stage;
  pct: number;
  detail?: string;
  pausedStage?: RunStreamState["pausedStage"];
  draftedCount: number;
  totalChapters: number;
};

export function projectProgressForRun(
  state: Pick<RunStreamState, "stage" | "pct" | "detail" | "pausedStage">,
  draftedCount: number,
  totalChapters: number,
): RunProgressSnapshot {
  return {
    stage: state.stage,
    pct: state.pct,
    detail: state.detail,
    pausedStage: state.pausedStage,
    draftedCount,
    totalChapters,
  };
}

function EndCard({
  status,
  title,
  body,
  actionLabel,
  onAction,
  pending,
  error,
}: {
  status: "error" | "empty";
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <AsyncState
      status={status}
      headingLevel={2}
      title={title}
      description={body}
      action={
        actionLabel && onAction ? (
          <div className="space-y-3">
            <Button
              onClick={() => {
                if (!pending) onAction();
              }}
              aria-busy={pending || undefined}
              aria-disabled={pending}
            >
              {pending ? <Spinner aria-hidden="true" /> : null}
              {actionLabel}
            </Button>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null
      }
    />
  );
}

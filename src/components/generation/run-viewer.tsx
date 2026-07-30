"use client";

import * as React from "react";
import { ArrowRight, CircleAlert } from "lucide-react";
import Link from "next/link";

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
import { PRODUCTION_STAGE_LABELS } from "@/lib/project-progress";
import type { ProjectExperience } from "@/lib/trial-story";
import {
  FULL_BOOK_UNLOCK_DESCRIPTION,
  fullBookSetupHref,
  fullBookUnlockHref,
  INCLUDED_STORY_NO_CARD_NOTE,
} from "@/lib/marketing/trial-offer";

/**
 * One short sentence per stage. Deliberately excludes the percentage, the cost
 * ticker and the prose stream: those change many times a second and would turn
 * the live region into noise. Only stage changes (and the drafted-chapter
 * count) alter this string, so assistive tech hears each milestone once.
 */
export function announcementFor(
  stage: Stage,
  draftedCount: number,
  plannedTotal: number,
  experience: ProjectExperience = "full_book",
): string {
  const includedStory = experience === "trial_short_story";
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
      return includedStory
        ? "The included story is paused. Try resuming; drafted chapters are kept and no purchase is required."
        : "Paused. Add credits to finish the book — drafted chapters are kept.";
    case "editing":
      return "Editing the chapters.";
    case "continuity":
      return `Checking continuity across the ${includedStory ? "story" : "book"}.`;
    case "revising":
      return "Revising against the continuity notes.";
    case "finalizing":
      return "Finishing the manuscript.";
    case "done":
      return `The ${includedStory ? "story" : "book"} is written.`;
    case "failed":
      return `${includedStory ? "Story" : "Book"} production failed.`;
    case "cancelled":
      return "The run was stopped.";
  }
}

function formatElapsed(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  if (totalMinutes < 1) return "Less than a minute";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function formatEventTime(value: string | undefined): string {
  if (!value) return "Waiting for first update";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Waiting for first update";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function ProductionTelemetry({
  state,
  now,
  draftedCount,
  plannedTotal,
  estimatedMinutes,
}: {
  state: RunStreamState;
  now: number;
  draftedCount: number;
  plannedTotal: number;
  estimatedMinutes?: number;
}) {
  const acceptedAt = state.health.acceptedAt ? Date.parse(state.health.acceptedAt) : Number.NaN;
  const completedAt = state.health.completedAt ? Date.parse(state.health.completedAt) : Number.NaN;
  const elapsedMs = Number.isFinite(acceptedAt)
    ? Math.max(0, (Number.isFinite(completedAt) ? completedAt : now) - acceptedAt)
    : (state.health.elapsedMs ?? 0);
  const facts = [
    {
      label: "Progress",
      value: `${Math.min(100, Math.max(0, Math.round(state.pct)))}%`,
    },
    { label: "Elapsed", value: formatElapsed(elapsedMs) },
    {
      label: "Estimated total",
      value: estimatedMinutes ? `About ${estimatedMinutes} min` : "Calculating",
      note: estimatedMinutes ? "Timing varies" : undefined,
    },
    { label: "Chapters assembled", value: `${draftedCount} of ${plannedTotal}` },
    { label: "Credits used", value: state.totalCredits.toFixed(1) },
    { label: "Last production update", value: formatEventTime(state.health.lastEventAt) },
  ];

  return (
    <section
      aria-labelledby="production-now-title"
      className="instrument-surface-raised overflow-hidden rounded-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="folio-label text-ai">Production now</p>
          <h2 id="production-now-title" className="mt-1 text-base font-semibold">
            {PRODUCTION_STAGE_LABELS[state.stage]}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {state.detail ?? "The production record will update as each stage begins."}
          </p>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {state.health.acceptedAt
            ? `Accepted ${formatEventTime(state.health.acceptedAt)}`
            : "Run accepted"}
        </p>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="min-w-0 border-r border-b border-border px-4 py-3 last:border-r-0 sm:[&:nth-last-child(-n+3)]:border-b-0 xl:border-b-0"
          >
            <dt className="folio-label text-muted-foreground">{fact.label}</dt>
            <dd className="mt-1 font-mono text-sm font-medium tabular-nums">{fact.value}</dd>
            {fact.note ? (
              <dd className="mt-0.5 text-[0.6875rem] text-muted-foreground">{fact.note}</dd>
            ) : null}
          </div>
        ))}
      </dl>
      {state.health.noWorkStarted && state.stage === "queued" ? (
        <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground sm:px-5">
          Your run is accepted and the writing team is being assigned. No credits have been used
          yet.
        </p>
      ) : null}
      {state.connection === "reconnecting" ? (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground sm:px-5">
          Live notes are reconnecting. Production status is still checked every five seconds.
        </p>
      ) : null}
    </section>
  );
}

export function IncludedStoryNextStep({
  projectId,
  fullBookUnlocked,
}: {
  projectId: string;
  fullBookUnlocked: boolean;
}) {
  return (
    <aside
      aria-labelledby="included-story-next-step-title"
      className="instrument-surface flex flex-col gap-4 rounded-sm px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
    >
      <div className="max-w-3xl">
        <p className="folio-label text-ai">After this story</p>
        <h2 id="included-story-next-step-title" className="mt-1 text-sm font-semibold">
          {fullBookUnlocked
            ? "This story is ready to go full length."
            : "Take this story from short form to full length."}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {fullBookUnlocked
            ? "The included story stays intact. A new full-length setup opens with its title, genre, and brief ready to review."
            : `${INCLUDED_STORY_NO_CARD_NOTE} ${FULL_BOOK_UNLOCK_DESCRIPTION} Your title, genre, and brief carry into the full-length setup after checkout.`}
        </p>
      </div>
      <Button
        variant="outline"
        render={
          <Link
            href={fullBookUnlocked ? fullBookSetupHref(projectId) : fullBookUnlockHref(projectId)}
          />
        }
        nativeButton={false}
        className="shrink-0"
      >
        {fullBookUnlocked ? "Continue at full length" : "Unlock the full-length version"}
        <ArrowRight aria-hidden="true" data-icon="inline-end" />
      </Button>
    </aside>
  );
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
  experience,
  fullBookUnlocked,
  snapshot,
  titles,
  tier,
  estimateUsd,
  estimatedMinutes,
  plannedChapters,
  targetWordsPerChapter,
  onRestart,
  restartPending,
  restartError,
  onProgress,
  onStartConfirmed,
}: {
  runId: string;
  /** Restart affordances re-run the FULL BOOK — hide them for scoped runs. */
  runKind?: "full_book" | "chapter" | "edit_pass" | "continuity" | "export";
  projectId: string;
  projectTitle: string;
  experience: ProjectExperience;
  fullBookUnlocked: boolean;
  snapshot: RunSnapshot;
  titles: Record<number, string | null>;
  tier: QualityTier;
  estimateUsd: number;
  estimatedMinutes?: number;
  plannedChapters: number;
  targetWordsPerChapter: number;
  onRestart: () => void;
  restartPending: boolean;
  restartError: string | null;
  onProgress?: (progress: RunProgressSnapshot) => void;
  onStartConfirmed?: () => void;
}) {
  const { state, subscribeChapterProse, markCancelled } = useRunStream(runId, snapshot);
  const terminal =
    state.stage === "done" || state.stage === "failed" || state.stage === "cancelled";
  const runSurfaceRef = React.useRef<HTMLDivElement | null>(null);
  const focusWasInsideRef = React.useRef(false);
  const previousTerminalRef = React.useRef(terminal);
  const [handoffRetryPending, setHandoffRetryPending] = React.useState(false);
  const [handoffRetryMessage, setHandoffRetryMessage] = React.useState<string | null>(null);
  const [handoffRetryError, setHandoffRetryError] = React.useState<string | null>(null);

  const railChapters = React.useMemo(
    () =>
      [...state.chapters.entries()]
        .sort(([a], [b]) => a - b)
        .map(([number, ch]) => ({ number, status: ch.status })),
    [state.chapters],
  );
  const draftingCount = Math.max(
    railChapters.filter((c) => c.status === "drafting").length,
    state.health.chapters?.drafting ?? 0,
  );
  const draftedCount = Math.max(
    railChapters.filter((c) => c.status !== "planned" && c.status !== "drafting").length,
    (state.health.chapters?.drafted ?? 0) +
      (state.health.chapters?.edited ?? 0) +
      (state.health.chapters?.final ?? 0),
  );
  const plannedTotal = Math.max(
    railChapters.length,
    plannedChapters,
    state.health.chapters?.total ?? 0,
  );
  const announcement = announcementFor(state.stage, draftedCount, plannedTotal, experience);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (terminal) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [terminal]);

  React.useEffect(() => {
    if (state.health.handoffConfirmed) onStartConfirmed?.();
  }, [onStartConfirmed, state.health.handoffConfirmed]);

  async function retryUncertainStart() {
    if (handoffRetryPending || !state.health.safeToRetry) return;
    setHandoffRetryPending(true);
    setHandoffRetryMessage(null);
    setHandoffRetryError(null);
    try {
      const response = await fetch(`/api/runs/${runId}/retry-start`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        confirmationPending?: boolean;
        handoffConfirmed?: boolean;
      };
      if (!response.ok) {
        setHandoffRetryError(body.error ?? "The production handoff could not be retried.");
        return;
      }
      if (body.handoffConfirmed) {
        onStartConfirmed?.();
        setHandoffRetryMessage("Production handoff confirmed. Status will update automatically.");
      } else if (body.confirmationPending) {
        setHandoffRetryMessage(
          "The same run is still being confirmed. No duplicate project was created.",
        );
      } else {
        setHandoffRetryMessage("The run status was refreshed. No duplicate project was created.");
      }
    } catch {
      setHandoffRetryError("The Studio could not be reached. This run remains safe to retry.");
    } finally {
      setHandoffRetryPending(false);
    }
  }

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
        experience={experience}
        fullBookUnlocked={fullBookUnlocked}
        review={
          state.review
            ? { score: state.review.score, issueCount: state.review.issueCount }
            : undefined
        }
        onWriteAgain={runKind === "full_book" && experience === "full_book" ? onRestart : undefined}
        writeAgainPending={restartPending}
        writeAgainError={restartError}
      />
    );
  } else if (state.stage === "failed") {
    const noWorkStarted = state.health.noWorkStarted && state.totalCredits <= 0;
    content = (
      <EndCard
        status="error"
        title={noWorkStarted ? "Writing didn’t begin." : "The run hit a wall."}
        body={
          noWorkStarted
            ? `No credits were used. ${state.error?.message ?? "The Studio could not start production."}`
            : (state.error?.message ??
              "Something went wrong while writing. Chapters already drafted are saved.")
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
        {state.health.acceptanceUncertain ? (
          <section
            aria-labelledby="production-handoff-title"
            className="rounded-sm border border-ai/45 bg-ai-soft px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-5"
          >
            <div>
              <p className="folio-label text-ai">Production handoff</p>
              <h2 id="production-handoff-title" className="mt-1 text-sm font-semibold">
                Confirm this same writing run
              </h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                The Studio saved your project but could not confirm that production received it.
                {state.health.noWorkStarted
                  ? " Writing has not begun and no credits have been used."
                  : " Any work already recorded remains saved."}{" "}
                Retrying reuses this run; it does not create another book.
              </p>
            </div>
            <div className="mt-3 shrink-0 sm:mt-0 sm:max-w-64">
              {state.health.safeToRetry ? (
                <Button
                  variant="outline"
                  onClick={retryUncertainStart}
                  aria-busy={handoffRetryPending || undefined}
                  aria-disabled={handoffRetryPending}
                >
                  {handoffRetryPending ? <Spinner aria-hidden="true" /> : null}
                  {handoffRetryPending ? "Confirming…" : "Retry this same start"}
                </Button>
              ) : (
                <>
                  <Button variant="outline" disabled>
                    <Spinner aria-hidden="true" />
                    Checking handoff…
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    A handoff attempt is still being checked. Safe retry becomes available
                    automatically if it is not confirmed within about two minutes.
                  </p>
                </>
              )}
              {handoffRetryMessage ? (
                <p role="status" className="mt-2 text-xs text-ai">
                  {handoffRetryMessage}
                </p>
              ) : null}
              {handoffRetryError ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {handoffRetryError}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
        <ProductionTelemetry
          state={state}
          now={now}
          draftedCount={draftedCount}
          plannedTotal={plannedTotal}
          estimatedMinutes={estimatedMinutes ?? state.health.estimatedMinutes}
        />
        {experience === "trial_short_story" &&
        state.stage !== "awaiting_credits" &&
        !state.health.acceptanceUncertain &&
        (state.health.handoffConfirmed || !state.health.noWorkStarted) ? (
          <IncludedStoryNextStep projectId={projectId} fullBookUnlocked={fullBookUnlocked} />
        ) : null}
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
          <CreditsBanner
            projectId={projectId}
            runId={runId}
            detail={state.detail}
            experience={experience}
            fullBookUnlocked={fullBookUnlocked}
          />
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
              experience={experience}
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
            ? `${experience === "trial_short_story" ? "Story" : "Book"} generation complete`
            : state.stage === "failed"
              ? `${experience === "trial_short_story" ? "Story" : "Book"} generation failed`
              : `${experience === "trial_short_story" ? "Story" : "Book"} generation stopped`
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

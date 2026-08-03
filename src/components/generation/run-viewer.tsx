"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Check, CircleAlert, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRunStream, type RunSnapshot, type RunStreamState } from "@/hooks/use-run-stream";
import { StageTimeline } from "@/components/generation/stage-timeline";
import { BookAssembly } from "@/components/generation/book-assembly";
import { LiveDraftPane } from "@/components/generation/live-draft-pane";
import { AgentFeed } from "@/components/generation/agent-feed";
import { CostTicker } from "@/components/generation/cost-ticker";
import { RunControls } from "@/components/generation/run-controls";
import { useAuthoringJourneyCommand } from "@/components/studio/authoring-journey-command";
import { ApprovalBanner } from "@/components/generation/approval-banner";
import { CreditsBanner } from "@/components/generation/credits-banner";
import { CompletionMoment } from "@/components/generation/completion-moment";
import {
  CreativeDecisionCard,
  creativeDecisionCardKey,
} from "@/components/generation/creative-decision-card";
import { ResponsiveInspector } from "@/components/studio/product-primitives";
import type { Stage } from "@/lib/run-events";
import type { QualityTier } from "@/ai/models";
import { PRODUCTION_STAGE_LABELS } from "@/lib/project-progress";
import type { ProjectExperience } from "@/lib/trial-story";
import type { AuthoringNextAction } from "@/lib/authoring-journey";

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
    case "awaiting_guidance":
      return "Paused. Choose one story direction before the outline is built.";
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

function useHashTargetFocus<T extends HTMLElement>(targetId: string) {
  const targetRef = React.useRef<T | null>(null);
  React.useEffect(() => {
    let frame: number | undefined;
    const focusTarget = () => {
      if (window.location.hash !== `#${targetId}`) return;
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const target = targetRef.current;
        if (!target || target.getClientRects().length === 0) return;
        target.focus({ preventScroll: true });
      });
    };
    focusTarget();
    window.addEventListener("hashchange", focusTarget);
    return () => {
      window.removeEventListener("hashchange", focusTarget);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [targetId]);
  return targetRef;
}

function ProductionTelemetry({
  state,
  now,
  draftedCount,
  plannedTotal,
  estimatedMinutes,
  cancellationRequested,
}: {
  state: RunStreamState;
  now: number;
  draftedCount: number;
  plannedTotal: number;
  estimatedMinutes?: number;
  cancellationRequested: boolean;
}) {
  const statusTargetRef = useHashTargetFocus<HTMLElement>("production-status");
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
    {
      label: "Last confirmed update",
      value: formatEventTime(state.health.lastUpdateAt ?? state.health.lastEventAt),
    },
  ];

  return (
    <section
      ref={statusTargetRef}
      id="production-status"
      tabIndex={-1}
      aria-labelledby="production-now-title"
      className="instrument-surface-raised scroll-mt-28 overflow-hidden rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <p className="folio-label text-ai">Production now</p>
          <h2 id="production-now-title" className="mt-1 text-base font-semibold">
            {cancellationRequested ? "Stopping safely" : PRODUCTION_STAGE_LABELS[state.stage]}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {cancellationRequested
              ? "No new model calls will begin. Work already saved remains available while the Studio confirms the stop."
              : (state.detail ?? "The production record will update as each stage begins.")}
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
      {state.health.noWorkStarted && state.stage === "queued" && !cancellationRequested ? (
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

export function isAuthoritativeFullBookCompletion(
  runKind: "full_book" | "chapter" | "edit_pass" | "continuity" | "export",
  state: Pick<RunStreamState, "stage" | "health">,
): boolean {
  return (
    runKind === "full_book" &&
    state.stage === "done" &&
    state.health.effectiveStatus === "completed" &&
    state.health.completionArtifactsReady === true
  );
}

/**
 * Terminal stream events are presentation hints only. The run-health endpoint
 * is the authority for ending a run, including a completed run whose artifact
 * proof is contradictory and must route to support rather than success.
 */
export function isAuthoritativeRunTerminal(state: Pick<RunStreamState, "health">): boolean {
  return (
    state.health.effectiveStatus === "completed" ||
    state.health.effectiveStatus === "failed" ||
    state.health.effectiveStatus === "cancelled"
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
  const { state, subscribeChapterProse, markCancelled, checkHealth } = useRunStream(
    runId,
    snapshot,
  );
  const { nextAction } = useAuthoringJourneyCommand();
  const recoveryAuthorized = isRecoveryActionAuthorized(nextAction, projectId, runKind);
  const terminal =
    state.stage === "done" || state.stage === "failed" || state.stage === "cancelled";
  const runSurfaceRef = React.useRef<HTMLDivElement | null>(null);
  const focusWasInsideRef = React.useRef(false);
  const previousTerminalRef = React.useRef(terminal);
  const [handoffRetryPending, setHandoffRetryPending] = React.useState(false);
  const [handoffRetryMessage, setHandoffRetryMessage] = React.useState<string | null>(null);
  const [handoffRetryError, setHandoffRetryError] = React.useState<string | null>(null);
  const [healthCheckPending, setHealthCheckPending] = React.useState(false);

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
  const cancellationRequestedAt = state.health.cancellation?.requestedAt;
  const cancellationRequested = Boolean(cancellationRequestedAt);
  const authoritativeTerminal = isAuthoritativeRunTerminal(state);
  const authoritativeCompletion = isAuthoritativeFullBookCompletion(runKind, state);
  const announcement = cancellationRequested
    ? "Stopping safely. No new model calls will begin while the Studio confirms the stop."
    : announcementFor(state.stage, draftedCount, plannedTotal, experience);
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
        {
          cancellationRequestedAt,
          authoritativeTerminal,
          authoritativeCompletion,
        },
      ),
    );
  }, [
    authoritativeCompletion,
    authoritativeTerminal,
    cancellationRequestedAt,
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
    content = (
      <RecoveryCard
        runId={runId}
        projectId={projectId}
        state={state}
        savedChapterCount={draftedCount}
        cancelled={false}
        onRecover={recoveryAuthorized ? onRestart : undefined}
        nextAction={nextAction}
        pending={restartPending}
        error={restartError}
      />
    );
  } else if (state.stage === "cancelled") {
    content = (
      <RecoveryCard
        runId={runId}
        projectId={projectId}
        state={state}
        savedChapterCount={draftedCount}
        cancelled
        onRecover={recoveryAuthorized ? onRestart : undefined}
        nextAction={nextAction}
        pending={restartPending}
        error={restartError}
      />
    );
  } else {
    content = (
      <div className="space-y-4">
        {state.health.telemetryDegraded ? (
          <section
            aria-labelledby="telemetry-degraded-title"
            className="rounded-sm border border-ember/40 bg-ember/8 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4"
          >
            <div>
              <h2 id="telemetry-degraded-title" className="text-sm font-semibold">
                Live updates are temporarily unavailable
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                The last confirmed production state is still shown. This does not mean writing
                stopped.
                {state.health.supportReference
                  ? ` Support reference: ${state.health.supportReference}.`
                  : ""}
              </p>
            </div>
            <div className="mt-3 flex shrink-0 flex-wrap gap-2 sm:mt-0">
              <Button
                variant="outline"
                size="sm"
                disabled={healthCheckPending}
                onClick={async () => {
                  setHealthCheckPending(true);
                  try {
                    await checkHealth();
                  } finally {
                    setHealthCheckPending(false);
                  }
                }}
              >
                {healthCheckPending ? <Spinner aria-hidden="true" /> : null}
                Check again
              </Button>
              <Button
                variant="ghost"
                size="sm"
                render={<a href="mailto:support@sopher.ai?subject=Authoring%20run%20help" />}
                nativeButton={false}
              >
                Get help
              </Button>
            </div>
          </section>
        ) : null}
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
          cancellationRequested={cancellationRequested}
        />
        <StageTimeline
          stage={state.stage}
          pct={state.pct}
          detail={state.detail}
          pausedStage={state.pausedStage}
          tier={tier}
          draftingCount={draftingCount}
          plannedTotal={plannedTotal}
        />

        {state.stage === "awaiting_guidance" && state.health.question ? (
          <CreativeDecisionCard
            key={creativeDecisionCardKey(state.health.question)}
            runId={runId}
            question={state.health.question}
            onAccepted={checkHealth}
            onRefreshRequested={checkHealth}
          />
        ) : null}

        {state.stage === "awaiting_approval" ? <ApprovalBanner projectId={projectId} /> : null}

        {state.stage === "awaiting_credits" ? (
          <CreditsBanner
            projectId={projectId}
            runId={runId}
            detail={state.detail}
            experience={experience}
            fullBookUnlocked={fullBookUnlocked}
            supportReference={state.health.supportReference}
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
              cancellationRequested={cancellationRequested}
            />
            <LiveDraftPane
              chapters={state.chapters}
              titles={titles}
              stage={state.stage}
              experience={experience}
              cancellationRequested={cancellationRequested}
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
              runId={runId}
              connection={state.connection}
              cancellationRequested={cancellationRequested}
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
  cancellationRequestedAt?: string;
  /** True only after Workflow-aware health confirms any terminal status. */
  authoritativeTerminal?: true;
  /** True only after Workflow-aware health validates full-book completion artifacts. */
  authoritativeCompletion?: true;
  draftedCount: number;
  totalChapters: number;
};

export function projectProgressForRun(
  state: Pick<RunStreamState, "stage" | "pct" | "detail" | "pausedStage">,
  draftedCount: number,
  totalChapters: number,
  signals: {
    cancellationRequestedAt?: string;
    authoritativeTerminal?: boolean;
    authoritativeCompletion?: boolean;
  } = {},
): RunProgressSnapshot {
  return {
    stage: state.stage,
    pct: state.pct,
    detail: state.detail,
    pausedStage: state.pausedStage,
    ...(signals.cancellationRequestedAt
      ? { cancellationRequestedAt: signals.cancellationRequestedAt }
      : {}),
    ...(signals.authoritativeTerminal ? { authoritativeTerminal: true as const } : {}),
    ...(signals.authoritativeCompletion ? { authoritativeCompletion: true as const } : {}),
    draftedCount,
    totalChapters,
  };
}

export function recoveryCardPrimaryAction(input: {
  projectId: string;
  savedChapterCount: number;
  nextAction: AuthoringNextAction | null;
  canRecover: boolean;
}): { kind: "recover"; label: string } | { kind: "link"; label: string; href: string } {
  if (input.nextAction) {
    if (input.nextAction.kind === "recover_saved_work" && input.canRecover) {
      return { kind: "recover", label: input.nextAction.label };
    }
    return {
      kind: "link",
      label: input.nextAction.label,
      href: input.nextAction.href,
    };
  }
  if (input.savedChapterCount > 0) {
    return {
      kind: "link",
      label: "Open saved manuscript",
      href: `/projects/${input.projectId}/editor`,
    };
  }
  return {
    kind: "link",
    label: "Contact support",
    href: "mailto:support@sopher.ai?subject=Authoring%20help",
  };
}

export function isRecoveryActionAuthorized(
  nextAction: AuthoringNextAction | null,
  projectId: string,
  runKind: "full_book" | "chapter" | "edit_pass" | "continuity" | "export",
): boolean {
  return (
    runKind === "full_book" &&
    nextAction?.kind === "recover_saved_work" &&
    nextAction.href === `/projects/${projectId}/write#authoring-recovery`
  );
}

function RecoveryCard({
  runId,
  projectId,
  state,
  savedChapterCount,
  cancelled,
  onRecover,
  nextAction,
  pending,
  error,
}: {
  runId: string;
  projectId: string;
  state: RunStreamState;
  savedChapterCount: number;
  cancelled: boolean;
  onRecover?: () => void;
  nextAction: AuthoringNextAction | null;
  pending: boolean;
  error: string | null;
}) {
  const [copied, setCopied] = React.useState(false);
  const recoveryTargetRef = useHashTargetFocus<HTMLElement>("authoring-recovery");
  const saved = Math.max(savedChapterCount, state.health.savedChapterCount ?? 0);
  const checkpoints = Math.max(0, state.health.savedCheckpointCount ?? 0);
  const noWorkStarted = state.health.noWorkStarted && state.totalCredits <= 0 && saved === 0;
  const primaryAction = recoveryCardPrimaryAction({
    projectId,
    savedChapterCount: saved,
    nextAction,
    canRecover: Boolean(onRecover),
  });
  const diagnostic = [
    "sopher.ai authoring diagnostic",
    `Run: ${runId}`,
    `Database status: ${state.health.databaseStatus}`,
    `Workflow status: ${state.health.workflowStatus ?? "unknown"}`,
    `Effective status: ${state.health.effectiveStatus}`,
    `Stage: ${state.health.rootErrorStage ?? state.stage}`,
    ...(state.health.rootErrorCode ? [`Error code: ${state.health.rootErrorCode}`] : []),
    ...(state.health.acceptedAt ? [`Accepted: ${state.health.acceptedAt}`] : []),
    ...(state.health.lastUpdateAt ? [`Last update: ${state.health.lastUpdateAt}`] : []),
    ...(state.health.supportReference
      ? [`Support reference: ${state.health.supportReference}`]
      : []),
  ].join("\n");

  return (
    <section
      ref={recoveryTargetRef}
      id="authoring-recovery"
      tabIndex={-1}
      aria-labelledby="authoring-recovery-title"
      className="instrument-surface-raised scroll-mt-28 rounded-sm border-l-destructive px-5 py-6 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:px-7"
    >
      <p className="folio-label text-destructive">
        {cancelled ? "Production stopped" : "Production needs attention"}
      </p>
      <h2 id="authoring-recovery-title" className="mt-2 text-xl font-semibold">
        {cancelled
          ? "The run stopped safely."
          : noWorkStarted
            ? "Writing didn’t begin."
            : "Production was interrupted."}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {cancelled
          ? "No new model calls or manuscript commits will begin for this run."
          : noWorkStarted
            ? `No credits were used. ${state.error?.message ?? "The Studio could not start production."}`
            : (state.error?.message ??
              "The current run could not finish, but every successfully committed chapter remains saved.")}
      </p>

      <dl className="mt-5 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-3">
        {[
          {
            label: "Saved work",
            value: `${saved} ${saved === 1 ? "chapter" : "chapters"} · ${checkpoints} ${
              checkpoints === 1 ? "checkpoint" : "checkpoints"
            }`,
          },
          { label: "Credits used", value: state.totalCredits.toFixed(2) },
          {
            label: "What happens next",
            value:
              nextAction?.kind === "contact_support"
                ? "Support safely rechecks the durable evidence"
                : saved > 0
                  ? "Reuse compatible checkpoints"
                  : primaryAction.label,
          },
        ].map((fact) => (
          <div key={fact.label} className="bg-card px-4 py-3">
            <dt className="folio-label text-muted-foreground">{fact.label}</dt>
            <dd className="mt-1 text-sm font-medium">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {state.health.supportReference ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          Support reference: {state.health.supportReference}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {primaryAction.kind === "recover" && onRecover ? (
          <Button
            onClick={() => {
              if (!pending) onRecover();
            }}
            aria-busy={pending || undefined}
            aria-disabled={pending}
          >
            {pending ? <Spinner aria-hidden="true" /> : null}
            {primaryAction.label}
          </Button>
        ) : (
          <Button
            render={
              primaryAction.kind === "link" && primaryAction.href.startsWith("/") ? (
                <Link href={primaryAction.href as Route} />
              ) : (
                <a href={primaryAction.kind === "link" ? primaryAction.href : undefined} />
              )
            }
            nativeButton={false}
          >
            {primaryAction.label}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(diagnostic);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Diagnostics copied" : "Copy diagnostics"}
        </Button>
        {nextAction?.kind !== "contact_support" ? (
          <Button
            variant="ghost"
            render={
              <a
                href={`mailto:support@sopher.ai?subject=${encodeURIComponent(
                  `Authoring help ${state.health.supportReference ?? runId}`,
                )}`}
              />
            }
            nativeButton={false}
          >
            Get help
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

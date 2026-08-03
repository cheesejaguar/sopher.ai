"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenText, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { RunViewer, type RunProgressSnapshot } from "@/components/generation/run-viewer";
import { CostDisplay } from "@/components/studio/product-primitives";
import { useProjectProgress } from "@/components/studio/project-progress";
import type { RunSnapshot } from "@/hooks/use-run-stream";
import { TIER_LABELS, type QualityTier } from "@/ai/models";
import { creditsForUsd } from "@/lib/billing/credits-shared";
import { estimateBookCost } from "@/ai/estimate";
import type { GenerationConfig } from "@/lib/run-events";
import type { ProjectExperience } from "@/lib/trial-story";
import { INCLUDED_STORY_NO_CARD_NOTE } from "@/lib/marketing/trial-offer";
import { wizardDraftKey, wizardRequestKey } from "@/components/wizard/wizard-state";

function words(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

const GENERATION_REQUEST_KEY = "sopher.generation-request.v1";
const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "awaiting_input"] as const);
type ActiveRunStatus = "queued" | "running" | "awaiting_input";
type StartSafetyLatch = "support_required" | "completed_replay";

export function generationRequestStorageKey(projectId: string): string {
  return `${GENERATION_REQUEST_KEY}:${projectId}`;
}

function createRequestKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function canAttachToWholeBookRun(
  status: number,
  runId: string | undefined,
  kind: string | undefined,
  runStatus?: string,
): runId is string {
  if (!runId) return false;
  const activeStatus = ACTIVE_RUN_STATUSES.has(runStatus as ActiveRunStatus);
  // Older accepted-start responses did not include the status. Preserve that
  // compatibility only for 202; conflict responses must prove the run active.
  if (status === 202) return runStatus === undefined || activeStatus;
  return status === 409 && kind === "full_book" && activeStatus;
}

export function isTerminalRequestReplay(
  status: number,
  response: { code?: string; retryable?: boolean } | null,
): boolean {
  return (
    status === 409 && response?.code === "terminal_request_replay" && response.retryable === true
  );
}

export function isCompletedRequestReplay(
  status: number,
  response: { code?: string; retryable?: boolean; status?: string } | null,
): boolean {
  return (
    status === 409 &&
    response?.code === "terminal_request_replay" &&
    response.retryable === false &&
    response.status === "completed"
  );
}

export function isSupportRequiredResponse(
  status: number,
  response: { code?: string } | null,
): boolean {
  return status === 409 && response?.code === "support_required";
}

export function journeyAllowsGenerationStart(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const journey = (response as { journey?: unknown }).journey;
  if (!journey || typeof journey !== "object") return false;
  const nextAction = (journey as { nextAction?: unknown }).nextAction;
  if (!nextAction || typeof nextAction !== "object") return false;
  const kind = (nextAction as { kind?: unknown }).kind;
  return kind === "start_production" || kind === "recover_saved_work";
}

function journeyStartBlockDescription(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const journey = (response as { journey?: unknown }).journey;
  if (!journey || typeof journey !== "object") return null;
  const nextAction = (journey as { nextAction?: unknown }).nextAction;
  if (!nextAction || typeof nextAction !== "object") return null;
  const description = (nextAction as { description?: unknown }).description;
  return typeof description === "string" ? description : null;
}

export function clearRecoveredWizardStorage(
  storage: Pick<Storage, "getItem" | "removeItem">,
  userId: string,
  experience: ProjectExperience,
  recoveryRequestKey: string | null,
): boolean {
  if (!recoveryRequestKey) return false;
  const requestStorageKey = wizardRequestKey(userId, experience);
  if (storage.getItem(requestStorageKey) !== recoveryRequestKey) return false;
  storage.removeItem(requestStorageKey);
  storage.removeItem(wizardDraftKey(userId, experience));
  return true;
}

export function shouldRefreshAuthoritativeJourney(progress: RunProgressSnapshot): boolean {
  return progress.authoritativeTerminal === true;
}

/**
 * Client island for the write stage: pre-flight when the project has never
 * run, the live run viewer otherwise. Starting a run swaps straight into the
 * live view with a fresh snapshot — no reload required.
 */
export function WriteExperience({
  projectId,
  projectTitle,
  userId,
  recoveryRequestKey,
  experience,
  fullBookUnlocked,
  tier,
  requireOutlineApproval,
  targetChapters,
  targetWordsPerChapter,
  estimateUsd,
  balanceCredits,
  requiredCredits,
  estimatedMinutes,
  initialRunShape,
  initialSnapshot,
  titles,
}: {
  projectId: string;
  projectTitle: string;
  userId: string;
  recoveryRequestKey: string | null;
  experience: ProjectExperience;
  fullBookUnlocked: boolean;
  tier: QualityTier;
  requireOutlineApproval: boolean;
  targetChapters: number;
  targetWordsPerChapter: number;
  estimateUsd: number;
  balanceCredits: number;
  requiredCredits: number;
  estimatedMinutes?: number;
  initialRunShape?: {
    tier: QualityTier;
    chapters: number;
    wordsPerChapter: number;
    estimateUsd: number;
    estimatedMinutes?: number;
  };
  initialSnapshot: RunSnapshot | null;
  titles: Record<number, string | null>;
}) {
  const router = useRouter();
  const [clientSnapshot, setClientSnapshot] = React.useState<{
    serverSnapshot: RunSnapshot | null;
    value: RunSnapshot | null;
  }>(() => ({ serverSnapshot: initialSnapshot, value: initialSnapshot }));
  const snapshot =
    clientSnapshot.serverSnapshot === initialSnapshot ? clientSnapshot.value : initialSnapshot;
  const setSnapshot = React.useCallback(
    (value: RunSnapshot) => setClientSnapshot({ serverSnapshot: initialSnapshot, value }),
    [initialSnapshot],
  );
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [runShape, setRunShape] = React.useState(() => {
    if (initialRunShape) return initialRunShape;
    const estimate = estimateBookCost(tier, targetChapters, targetWordsPerChapter);
    return {
      tier,
      chapters: targetChapters,
      wordsPerChapter: targetWordsPerChapter,
      estimateUsd,
      estimatedMinutes: estimatedMinutes ?? estimate.estimatedMinutes,
    };
  });
  const { publishProgress } = useProjectProgress();
  // A safety response may arrive while the server snapshot is null. Do not key
  // the latch to object identity: null would make the visible start action inert
  // forever. A subsequent activation performs a read-only journey recheck and
  // can proceed only when the server explicitly derives a start/recovery action.
  const startSafetyLatchRef = React.useRef<StartSafetyLatch | null>(null);
  const activeRunId = snapshot?.run.id ?? null;
  const handleProgress = React.useCallback(
    (progress: RunProgressSnapshot) => {
      if (!activeRunId) return;
      publishProgress(
        {
          runId: activeRunId,
          stage: progress.stage,
          pct: progress.pct,
          detail: progress.detail,
          pausedStage: progress.pausedStage,
          cancellationRequestedAt: progress.cancellationRequestedAt,
          draftedCount: progress.draftedCount,
          totalChapters: progress.totalChapters,
        },
        {
          refreshAuthoritativeJourney: shouldRefreshAuthoritativeJourney(progress),
        },
      );
    },
    [activeRunId, publishProgress],
  );

  // Starting (or restarting) a run unmounts the button that was just pressed,
  // which would drop keyboard focus to <body>. Move it into the live view
  // instead so the tab order continues from where the user was. — WCAG 2.4.3
  const runRef = React.useRef<HTMLDivElement | null>(null);
  const moveFocusToRun = React.useRef(false);
  const requestKeyRef = React.useRef<string | null>(null);
  const clearRecoveredWizardState = React.useCallback(() => {
    clearRecoveredWizardStorage(window.localStorage, userId, experience, recoveryRequestKey);
  }, [experience, recoveryRequestKey, userId]);

  const recheckStartSafety = React.useCallback(
    async (explicitCompletedRestart: boolean): Promise<boolean> => {
      const latch = startSafetyLatchRef.current;
      if (!latch) return true;

      // A completed-request replay protects a lost response from silently
      // starting paid work twice. Once the refreshed UI proves the full-book
      // run completed, the separately confirmed "Start new draft" action is a
      // new author intent and may use a fresh request key. Support blocks never
      // receive this bypass.
      if (
        latch === "completed_replay" &&
        explicitCompletedRestart &&
        experience === "full_book" &&
        snapshot?.run.status === "completed"
      ) {
        startSafetyLatchRef.current = null;
        return true;
      }

      const response = await fetch(`/api/projects/${projectId}/journey`, {
        method: "GET",
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok && journeyAllowsGenerationStart(body)) {
        startSafetyLatchRef.current = null;
        return true;
      }
      setError(
        journeyStartBlockDescription(body) ??
          (response.ok
            ? "The latest project state does not allow another production start."
            : "The studio could not safely recheck this project. Try again in a moment."),
      );
      router.refresh();
      return false;
    },
    [experience, projectId, router, snapshot?.run.status],
  );

  React.useEffect(() => {
    if (snapshot && moveFocusToRun.current) {
      moveFocusToRun.current = false;
      runRef.current?.focus();
    }
  }, [snapshot]);

  async function startRun(options?: { explicitCompletedRestart?: boolean }) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (!(await recheckStartSafety(options?.explicitCompletedRestart === true))) return;
      const storageKey = generationRequestStorageKey(projectId);
      let requestKey =
        requestKeyRef.current ?? window.localStorage.getItem(storageKey) ?? createRequestKey();
      requestKeyRef.current = requestKey;
      window.localStorage.setItem(storageKey, requestKey);
      let terminalReplayRetried = false;
      let res: Response;
      let json: unknown;
      let responseBody: {
        runId?: string;
        kind?: string;
        status?: string;
        config?: Partial<GenerationConfig>;
        code?: string;
        retryable?: boolean;
        error?: string;
        reattached?: boolean;
      } | null;

      while (true) {
        res = await fetch(`/api/projects/${projectId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier, requireOutlineApproval, requestKey }),
        });
        json = await res.json().catch(() => null);
        responseBody = json as typeof responseBody;
        if (isSupportRequiredResponse(res.status, responseBody)) {
          startSafetyLatchRef.current = "support_required";
          window.localStorage.removeItem(storageKey);
          requestKeyRef.current = null;
          setError(
            responseBody?.error ??
              "Production needs support before another safe start can be attempted.",
          );
          router.refresh();
          return;
        }
        if (isCompletedRequestReplay(res.status, responseBody)) {
          startSafetyLatchRef.current = "completed_replay";
          // Never turn a lost response for already-completed paid work into a
          // second run. Retire the stale key and re-read the durable journey.
          window.localStorage.removeItem(storageKey);
          requestKeyRef.current = null;
          setError(responseBody?.error ?? "The completed project state is being refreshed.");
          router.refresh();
          return;
        }
        if (!isTerminalRequestReplay(res.status, responseBody)) break;

        // A response can be lost long enough for its durable run to become
        // terminal while the request key remains in localStorage. It is not an
        // active run to reattach to. Retire that key and retry once, then surface
        // the server response rather than entering an automatic retry loop.
        window.localStorage.removeItem(storageKey);
        requestKeyRef.current = null;
        if (terminalReplayRetried) break;
        terminalReplayRetried = true;
        requestKey = createRequestKey();
        requestKeyRef.current = requestKey;
        window.localStorage.setItem(storageKey, requestKey);
      }

      const runId = responseBody?.runId;
      if (canAttachToWholeBookRun(res.status, runId, responseBody?.kind, responseBody?.status)) {
        window.localStorage.removeItem(storageKey);
        requestKeyRef.current = null;
        clearRecoveredWizardState();
        const returnedConfig = responseBody?.config;
        const runTier = returnedConfig?.tier ?? tier;
        const chapters = returnedConfig?.targetChapters ?? targetChapters;
        const wordsPerChapter = returnedConfig?.targetWordsPerChapter ?? targetWordsPerChapter;
        const nextEstimate = estimateBookCost(runTier, chapters, wordsPerChapter);
        setRunShape({
          tier: runTier,
          chapters,
          wordsPerChapter,
          estimateUsd: nextEstimate.totalUsd,
          estimatedMinutes: nextEstimate.estimatedMinutes,
        });
        // A duplicate full-book request attaches to its existing run. Scoped
        // chapter/edit jobs deliberately stay a busy error: their event shape
        // does not belong in this whole-manuscript viewer.
        const returnedStatus = ACTIVE_RUN_STATUSES.has(responseBody?.status as ActiveRunStatus)
          ? (responseBody?.status as ActiveRunStatus)
          : "queued";
        const authoritativeReattach =
          responseBody?.reattached === true || res.status === 409 || returnedStatus !== "queued";
        if (authoritativeReattach) {
          // The start endpoint intentionally returns no event history, pause,
          // chapter rows, or canonical health. Mounting RunViewer from that
          // partial response would synchronously publish guessed progress
          // before its first health poll. Wait for the refreshed server page,
          // which loads the complete authoritative snapshot instead.
          moveFocusToRun.current = true;
          router.refresh();
          return;
        }
        const draftedCount =
          snapshot?.chapters?.filter((chapter) =>
            ["drafted", "edited", "final"].includes(chapter.status),
          ).length ?? 0;
        publishProgress({
          runId,
          stage: "queued",
          pct: 0,
          detail: "Preparing the writing room",
          draftedCount,
          totalChapters: chapters,
        });
        moveFocusToRun.current = true;
        setSnapshot({
          run: { id: runId, status: returnedStatus, error: null, kind: "full_book" },
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
        projectId={projectId}
        tier={tier}
        requireOutlineApproval={requireOutlineApproval}
        targetChapters={targetChapters}
        targetWordsPerChapter={targetWordsPerChapter}
        estimateUsd={estimateUsd}
        balanceCredits={balanceCredits}
        requiredCredits={requiredCredits}
        experience={experience}
        onStart={startRun}
        pending={pending}
        error={error}
      />
    );
  }

  return (
    <div
      ref={runRef}
      role="region"
      aria-label="Book generation run"
      tabIndex={-1}
      className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <RunViewer
        key={snapshot.run.id}
        runId={snapshot.run.id}
        runKind={snapshot.run.kind ?? "full_book"}
        projectId={projectId}
        projectTitle={projectTitle}
        experience={experience}
        fullBookUnlocked={fullBookUnlocked}
        snapshot={snapshot}
        titles={titles}
        tier={runShape.tier}
        estimateUsd={runShape.estimateUsd}
        estimatedMinutes={runShape.estimatedMinutes}
        plannedChapters={runShape.chapters}
        targetWordsPerChapter={runShape.wordsPerChapter}
        onRestart={() => void startRun({ explicitCompletedRestart: true })}
        restartPending={pending}
        restartError={error}
        onProgress={handleProgress}
        onStartConfirmed={clearRecoveredWizardState}
      />
    </div>
  );
}

function PreFlight({
  projectId,
  tier,
  requireOutlineApproval,
  targetChapters,
  targetWordsPerChapter,
  estimateUsd,
  balanceCredits,
  requiredCredits,
  experience,
  onStart,
  pending,
  error,
}: {
  projectId: string;
  tier: QualityTier;
  requireOutlineApproval: boolean;
  targetChapters: number;
  targetWordsPerChapter: number;
  estimateUsd: number;
  balanceCredits: number;
  requiredCredits: number;
  experience: ProjectExperience;
  onStart: () => void;
  pending: boolean;
  error: string | null;
}) {
  const includedStory = experience === "trial_short_story";
  const underfunded = !includedStory && balanceCredits < requiredCredits;
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
          {includedStory
            ? "Your included story is ready."
            : "Everything’s set. The writers are waiting on you."}
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {includedStory ? `${INCLUDED_STORY_NO_CARD_NOTE} ` : null}
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
          {underfunded ? (
            <Button
              size="lg"
              render={
                <Link
                  href={`/studio/credits?return=${encodeURIComponent(`/projects/${projectId}/write`)}&needed=${encodeURIComponent(String(requiredCredits - balanceCredits))}`}
                />
              }
              nativeButton={false}
            >
              Add credits to start
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={onStart}
              aria-busy={pending || undefined}
              aria-disabled={pending}
              className={pending ? "opacity-50" : undefined}
            >
              {pending ? (
                <Spinner aria-hidden="true" />
              ) : (
                <PenLine aria-hidden="true" data-icon="inline-start" />
              )}
              {includedStory ? "Start my included story" : "Start writing this book"}
            </Button>
          )}
          {underfunded ? (
            <p className="text-sm text-muted-foreground">
              Your saved setup needs{" "}
              <span className="font-mono tabular-nums">
                {(requiredCredits - balanceCredits).toFixed(2)}
              </span>{" "}
              more credits. Checkout returns here without changing it.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      <section
        aria-label={includedStory ? "Included production" : "Cost estimate"}
        className="instrument-surface rounded-sm p-5"
      >
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <BookOpenText aria-hidden="true" className="size-3.5 text-primary" />
          <h4 className="folio-label text-muted-foreground">
            {includedStory ? "Included production" : "Credit quote"}
          </h4>
        </div>
        {includedStory ? (
          <div className="mt-5">
            <p className="text-2xl font-semibold tracking-[-0.025em]">Included</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              3 chapters × about 1,000 words, Standard quality, with outline approval.
            </p>
          </div>
        ) : (
          <CostDisplay
            className="mt-5"
            credits={creditsForUsd(estimateUsd)}
            usd={estimateUsd}
            note="±30%, metered as the agents work"
          />
        )}
      </section>
    </div>
  );
}

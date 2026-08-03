"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpenCheck, CircleStop, Sparkles } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStudioSuspension } from "@/components/studio/studio-access-context";

export type ManuscriptRevisionRun = {
  id: string;
  status: "queued" | "running" | "awaiting_input" | "completed" | "failed" | "cancelled";
  error?: string | null;
  instruction?: string;
  confirmationPending?: boolean;
  completion?: {
    reviewedChapterCount: number;
    suggestionCount: number;
  } | null;
};

type EditPassRun = ManuscriptRevisionRun;

type EditPassResult = {
  run: EditPassRun | null;
  suggestionCount?: number;
  firstSuggestionChapter?: number | null;
  maximumCredits?: number;
  error?: unknown;
  code?: string;
  action?: { kind: string; href: string };
};

type RunSnapshot = {
  run?: EditPassRun;
  health?: {
    effectiveStatus: EditPassRun["status"];
    progressPct: number;
    stageDescription: string | null;
    safeToRetry: boolean;
    cancellation: { requestedAt: string } | null;
  };
};

type TerminalRunStatus = Extract<EditPassRun["status"], "completed" | "failed" | "cancelled">;

const EXAMPLES = [
  "Make the dialogue sharper and more distinct for each character",
  "Increase the tension without changing the ending",
  "Make the prose warmer and more adventurous",
] as const;

function active(status: EditPassRun["status"] | undefined): boolean {
  return status === "queued" || status === "running" || status === "awaiting_input";
}

function errorMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const fieldErrors = (value as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    const first = fieldErrors ? Object.values(fieldErrors).flat()[0] : null;
    if (first) return first;
  }
  return "The review could not be started. Your instruction is still here — try again.";
}

export function ManuscriptRevisionPanel({
  projectId,
  chapterCount,
  maximumCredits,
  initialRun = null,
  initialSuggestionCount = 0,
  initialFirstSuggestionChapter = null,
}: {
  projectId: string;
  chapterCount: number;
  maximumCredits: number;
  initialRun?: ManuscriptRevisionRun | null;
  initialSuggestionCount?: number;
  initialFirstSuggestionChapter?: number | null;
}) {
  const router = useRouter();
  const suspended = useStudioSuspension();
  const [instruction, setInstruction] = useState(initialRun?.instruction ?? "");
  const [run, setRun] = useState<EditPassRun | null>(initialRun);
  const [progress, setProgress] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const [suggestionCount, setSuggestionCount] = useState(initialSuggestionCount);
  const [firstSuggestionChapter, setFirstSuggestionChapter] = useState<number | null>(
    initialFirstSuggestionChapter,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditsHref, setCreditsHref] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [terminalResultPending, setTerminalResultPending] = useState<TerminalRunStatus | null>(
    null,
  );
  const [resultPollNonce, setResultPollNonce] = useState(0);
  const requestKeyRef = useRef<string | null>(null);
  const startedHereRef = useRef(false);
  const storageKey = `sopher:manuscript-edit-pass:${projectId}`;

  const requestKey = useCallback(() => {
    if (requestKeyRef.current) return requestKeyRef.current;
    const stored = window.sessionStorage.getItem(storageKey);
    const key = stored || crypto.randomUUID();
    requestKeyRef.current = key;
    window.sessionStorage.setItem(storageKey, key);
    return key;
  }, [storageKey]);

  const renewRequestKey = useCallback(() => {
    if (active(run?.status)) return;
    const key = crypto.randomUUID();
    requestKeyRef.current = key;
    window.sessionStorage.setItem(storageKey, key);
  }, [run?.status, storageKey]);

  const loadLatest = useCallback(async (): Promise<EditPassResult | null> => {
    try {
      const response = await fetch(`/api/projects/${projectId}/edit-pass`, {
        cache: "no-store",
      });
      if (!response.ok) return null;
      return (await response.json()) as EditPassResult;
    } catch {
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    const runId = run?.id;
    if (!runId || !active(run.status)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (!response.ok) throw new Error("status unavailable");
        const snapshot = (await response.json()) as RunSnapshot;
        if (cancelled || !snapshot.health) return;
        const status = snapshot.health.effectiveStatus;
        setProgress(snapshot.health.progressPct);
        setDetail(snapshot.health.stageDescription);
        if (snapshot.health.cancellation)
          setAnnouncement("Stopping safely after the current call.");

        if (status === "completed" || status === "failed" || status === "cancelled") {
          setTerminalResultPending(status);
          const latest = await loadLatest();
          if (
            cancelled ||
            !latest?.run ||
            latest.run.id !== runId ||
            active(latest.run.status) ||
            typeof latest.suggestionCount !== "number" ||
            latest.firstSuggestionChapter === undefined
          ) {
            if (!cancelled) {
              setDetail(
                status === "completed"
                  ? "The review finished, but its saved suggestions are temporarily unavailable. Checking again."
                  : "The review stopped, but its saved results are temporarily unavailable. Checking again.",
              );
              setAnnouncement(
                "The review reached a final state. Saved results are temporarily unavailable; Sopher will check again.",
              );
              timer = setTimeout(poll, 5_000);
            }
            return;
          }

          setTerminalResultPending(null);
          setRun({ ...latest.run, status });
          setSuggestionCount(latest.suggestionCount);
          setFirstSuggestionChapter(latest.firstSuggestionChapter);
          if (latest.run.instruction && !instruction) setInstruction(latest.run.instruction);
          router.refresh();
          if (status === "completed") {
            const count = latest.suggestionCount;
            setAnnouncement(
              count === 0
                ? "Manuscript review complete. No changes were suggested."
                : `Manuscript review complete. ${count} suggestions are ready for your decision.`,
            );
            if (
              startedHereRef.current &&
              latest.run.id === runId &&
              latest.firstSuggestionChapter
            ) {
              router.push(
                `/projects/${projectId}/editor/${latest.firstSuggestionChapter}?suggestions=1&reviewRun=${runId}`,
              );
            }
          } else {
            setAnnouncement(
              status === "cancelled"
                ? "Review stopped. Suggestions already saved remain available."
                : "The review stopped. Suggestions from completed chapters remain available.",
            );
          }
          startedHereRef.current = false;
          return;
        }

        setTerminalResultPending(null);
        setRun((current) => (current ? { ...current, status } : current));

        if (snapshot.health.safeToRetry) {
          setDetail("The handoff is taking longer than expected. You can safely reconnect it.");
        }
      } catch {
        if (!cancelled)
          setDetail("Status is temporarily unavailable. The review may still be running.");
      }
      if (!cancelled) timer = setTimeout(poll, 5_000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [instruction, loadLatest, projectId, resultPollNonce, router, run?.id, run?.status]);

  const startReview = async () => {
    const trimmed = instruction.replace(/\s+/g, " ").trim();
    if (trimmed.length < 3) {
      setError("Describe the change you want across the manuscript.");
      return;
    }
    setBusy(true);
    setError(null);
    setCreditsHref(null);
    setAnnouncement("Starting a non-destructive manuscript review.");
    try {
      const response = await fetch(`/api/projects/${projectId}/edit-pass`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: trimmed, requestKey: requestKey() }),
      });
      const result = (await response.json().catch(() => ({}))) as EditPassResult;
      if (response.status === 202 && result.run) {
        startedHereRef.current = true;
        setRun(result.run);
        setProgress(0);
        setDetail(
          result.run.confirmationPending
            ? "Confirming that the review reached the writing room"
            : "Preparing the editorial desk",
        );
        setAnnouncement(
          "The manuscript review was accepted. Nothing will change without your approval.",
        );
        return;
      }
      setError(errorMessage(result.error));
      if (result.code === "request_key_reused") renewRequestKey();
      if (result.action?.kind === "add_credits") setCreditsHref(result.action.href);
    } catch {
      setError(
        "Connection lost while starting. Retry with the same instruction to reattach safely.",
      );
    } finally {
      setBusy(false);
    }
  };

  const stopReview = async () => {
    if (!run || !active(run.status)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/generate`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
      });
      if (response.ok) {
        setDetail("Stopping safely after the current call");
        setAnnouncement(
          "Stop requested. Settled costs remain accurate; no new output will be committed.",
        );
      } else {
        setError("The stop request was not confirmed. Check the latest status and try again.");
      }
    } catch {
      setError(
        "Connection lost while requesting a safe stop. The review may still be running. Check status and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const reconnect = async () => {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${run.id}/retry-start`, { method: "POST" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok && response.status !== 202) {
        setError(result.error ?? "The review could not be reconnected yet.");
      } else {
        setDetail("Reconnecting the same review — no duplicate run was created");
        setAnnouncement("The same manuscript review was reconnected safely.");
      }
    } catch {
      setError(
        "Connection lost while reconnecting. The original review may still be queued. Check status and try Reconnect again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const isActive = active(run?.status);
  const isWaitingForTerminalResult = isActive && terminalResultPending !== null;
  const reviewHref = firstSuggestionChapter
    ? `/projects/${projectId}/editor/${firstSuggestionChapter}?suggestions=1${run?.id ? `&reviewRun=${run.id}` : ""}`
    : null;

  return (
    <section
      aria-labelledby="manuscript-direction-heading"
      className="instrument-surface overflow-hidden"
    >
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="folio-label text-ai">Whole-manuscript direction</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="manuscript-direction-heading" className="font-display text-base font-semibold">
              Ask Sopher to review the book through one lens
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Every nonempty chapter is checked against your direction. Sopher creates anchored
              suggestions for you to accept, edit, or reject—your manuscript is never silently
              rewritten.
            </p>
          </div>
          <span className="shrink-0 border border-ai/30 bg-ai-soft/20 px-2 py-1 font-mono text-[11px] text-ai">
            {chapterCount} chapter{chapterCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_16rem] sm:px-5">
        <div className="min-w-0">
          <label htmlFor="manuscript-direction" className="text-sm font-semibold">
            What should change across the book?
          </label>
          <Textarea
            id="manuscript-direction"
            value={instruction}
            onChange={(event) => {
              setInstruction(event.target.value);
              setError(null);
              renewRequestKey();
            }}
            maxLength={1_000}
            rows={4}
            disabled={isActive}
            aria-describedby="manuscript-direction-help manuscript-direction-cost"
            placeholder="For example: Make the dialogue sharper while preserving the plot and character voices."
            className="mt-2 min-h-28 resize-y"
          />
          <p
            id="manuscript-direction-help"
            className="mt-2 text-xs leading-relaxed text-muted-foreground"
          >
            Be specific about the effect you want and anything that must stay unchanged.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Example directions">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                disabled={isActive}
                onClick={() => {
                  setInstruction(example);
                  setError(null);
                  renewRequestKey();
                }}
                className="min-h-11 border border-border bg-background px-3 py-2 text-left text-xs leading-snug text-muted-foreground transition-colors hover:border-ai/50 hover:text-foreground focus-visible:border-ai disabled:opacity-50"
              >
                {example}
              </button>
            ))}
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-4 border-l-2 border-destructive pl-3 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => void startReview()}
              disabled={busy || isActive || suspended || chapterCount === 0}
              className="min-h-11 rounded-sm"
            >
              <Sparkles aria-hidden="true" /> Review the whole manuscript
            </Button>
            {creditsHref ? (
              <Link
                href={creditsHref as Route}
                className={buttonVariants({ variant: "outline", className: "min-h-11 rounded-sm" })}
              >
                Add credits to review
              </Link>
            ) : null}
            {reviewHref && suggestionCount > 0 && !isActive ? (
              <Link
                href={reviewHref as Route}
                className={buttonVariants({ variant: "outline", className: "min-h-11 rounded-sm" })}
              >
                Review {suggestionCount} suggestion{suggestionCount === 1 ? "" : "s"}
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          <p id="manuscript-direction-cost" className="mt-2 text-xs text-muted-foreground">
            Up to {maximumCredits.toFixed(2)} credits are required to start. Actual use is metered
            chapter by chapter; unused reserved credits are released.
          </p>
        </div>

        <aside
          className="min-w-0 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5"
          aria-label="Review status"
        >
          <p className="folio-label text-muted-foreground">Editorial pass</p>
          {run ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${isActive ? "bg-ai" : run.status === "completed" ? "bg-success" : "bg-muted-foreground"}`}
                />
                {isWaitingForTerminalResult
                  ? terminalResultPending === "completed"
                    ? "Review finished — loading results"
                    : "Review stopped — loading saved work"
                  : run.status === "completed"
                    ? "Review complete"
                    : run.status === "failed"
                      ? "Review interrupted"
                      : run.status === "cancelled"
                        ? "Review stopped"
                        : "Review in progress"}
              </div>
              {isWaitingForTerminalResult ? (
                <>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {detail ?? "Loading the saved review results"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setResultPollNonce((current) => current + 1)}
                    disabled={busy}
                    className="min-h-11 rounded-sm"
                  >
                    Check results
                  </Button>
                </>
              ) : isActive ? (
                <>
                  <progress
                    value={progress}
                    max={100}
                    aria-label={`Manuscript review ${progress}% complete`}
                    className="h-1.5 w-full accent-ai"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {detail ?? "Preparing the editorial desk"}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {progress}% complete
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void stopReview()}
                      disabled={busy}
                      className="min-h-11 rounded-sm"
                    >
                      <CircleStop aria-hidden="true" /> Stop safely
                    </Button>
                    {detail?.startsWith("The handoff") ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void reconnect()}
                        disabled={busy}
                        className="min-h-11 rounded-sm"
                      >
                        Reconnect
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : run.status === "completed" ? (
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <BookOpenCheck
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-success"
                  />
                  {(run.completion?.suggestionCount ?? suggestionCount) === 0
                    ? "Sopher found no worthwhile changes for that direction. The zero-change result is saved."
                    : suggestionCount === 0
                      ? "Every suggestion from this review has been resolved."
                      : `${suggestionCount} anchored suggestion${suggestionCount === 1 ? " is" : "s are"} waiting for your decision.`}
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {run.error ?? "Suggestions from chapters already reviewed remain available."}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              One pass, one clear direction, and a review queue you control.
            </p>
          )}
        </aside>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}

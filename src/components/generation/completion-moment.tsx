"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ConsistencyReviewAction,
  isConsistencyReviewSkipped,
} from "@/components/generation/consistency-review-action";
import type { ProjectExperience } from "@/lib/trial-story";
import {
  FULL_BOOK_UNLOCK_DESCRIPTION,
  fullBookSetupHref,
  fullBookUnlockHref,
  INCLUDED_STORY_NO_CARD_NOTE,
} from "@/lib/marketing/trial-offer";

const MAX_SEGMENTS = 24;
/** Segment width (0.5rem) + gap (0.25rem) — used to slide segments to center. */
const PITCH_REM = 0.75;

function titleSize(title: string): string {
  if (title.length > 180) return "text-[0.5rem] leading-[1.25]";
  if (title.length > 110) return "text-[0.5625rem] leading-[1.3]";
  if (title.length > 72) return "text-[0.6875rem] leading-[1.35]";
  if (title.length > 42) return "text-xs leading-[1.4]";
  return "text-base leading-tight";
}

/**
 * The completion moment: the chapter rail closes into a finished, stacked-page
 * book bearing the complete title. Pure CSS transforms; the global
 * reduced-motion rules collapse the choreography into an instant crossfade.
 */
export function CompletionMoment({
  projectId,
  projectTitle,
  chapterCount,
  recommendation,
  experience = "full_book",
  fullBookUnlocked = false,
  review,
  notices,
  onWriteAgain,
  writeAgainPending = false,
  writeAgainError,
}: {
  projectId: string;
  projectTitle: string;
  chapterCount: number;
  recommendation?: string;
  experience?: ProjectExperience;
  fullBookUnlocked?: boolean;
  review?: { score: number; issueCount: number };
  /**
   * Finishing steps that were skipped so the manuscript could still be
   * delivered. The book is done; this says what it did not get.
   */
  notices?: { code: string; message: string }[];
  onWriteAgain?: () => void;
  writeAgainPending?: boolean;
  writeAgainError?: string | null;
}) {
  const [closed, setClosed] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  // The consistency review is the one skipped pass an author can get back, so
  // the offer to re-run it belongs beside the notice that says it did not run.
  const consistencyReviewSkipped = isConsistencyReviewSkipped(notices?.map((n) => n.code));

  React.useEffect(() => {
    // Double rAF so the open state paints before the transition begins.
    let inner: number | undefined;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setClosed(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner !== undefined) cancelAnimationFrame(inner);
    };
  }, []);

  const segments = Math.max(1, Math.min(chapterCount, MAX_SEGMENTS));
  const mid = (segments - 1) / 2;
  const includedStory = experience === "trial_short_story";
  const canWriteAgain = !includedStory && Boolean(onWriteAgain);
  const displayTitle =
    projectTitle.trim() || (includedStory ? "Your short story" : "Your manuscript");
  const artifactLabel = `Finished ${includedStory ? "story" : "book"}: ${displayTitle}. ${chapterCount} ${chapterCount === 1 ? "chapter" : "chapters"}.`;

  return (
    <section
      aria-label={includedStory ? "Story complete" : "Book complete"}
      className="instrument-surface-raised flex flex-col items-center gap-8 rounded-sm px-6 py-12"
    >
      <div className="relative flex h-52 w-full items-center justify-center sm:h-56">
        <div
          aria-hidden="true"
          className="flex items-center gap-1 transition-opacity duration-300"
          style={{
            opacity: closed ? 0 : 1,
            transitionDelay: closed ? "850ms" : "0ms",
          }}
        >
          {Array.from({ length: segments }, (_, i) => (
            <span
              key={i}
              className="h-28 w-2 rounded-[3px] bg-primary transition-transform duration-700 ease-in-out"
              style={{
                transform: closed
                  ? `translateX(${((mid - i) * PITCH_REM).toFixed(3)}rem)`
                  : undefined,
                transitionDelay: `${i * 20}ms`,
              }}
            />
          ))}
        </div>
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-500"
          style={{ opacity: closed ? 1 : 0, transitionDelay: closed ? "900ms" : "0ms" }}
        >
          <div role="img" aria-label={artifactLabel} className="relative h-48 w-40 sm:h-52 sm:w-44">
            <div
              aria-hidden="true"
              className="absolute inset-y-1 right-0 left-4 translate-x-1 translate-y-2 rounded-[3px] border border-border bg-instrument"
            />
            <div
              aria-hidden="true"
              className="absolute inset-y-0 right-1 left-3 translate-x-1 translate-y-1 overflow-hidden rounded-[3px] border border-paper-edge bg-paper"
            >
              <span className="absolute inset-x-2 top-1/4 h-px bg-paper-edge/80" />
              <span className="absolute inset-x-2 top-1/2 h-px bg-paper-edge/80" />
              <span className="absolute inset-x-2 top-3/4 h-px bg-paper-edge/80" />
            </div>
            <div
              aria-hidden="true"
              className="absolute inset-y-1 right-3 left-0 overflow-hidden rounded-[3px] border border-primary/55 bg-future-stage text-future-stage-foreground shadow-[0_20px_36px_-26px_oklch(0.02_0.02_274/95%)]"
            >
              <span className="absolute inset-y-0 left-0 w-3 border-r border-primary/70 bg-primary" />
              <span className="absolute inset-y-0 left-3 w-px bg-future-stage-accent/35" />
              <span className="absolute top-4 right-0 h-px w-5 bg-ai/80" />
              <span className="flex h-full min-w-0 flex-col py-4 pr-4 pl-7 text-left">
                <span className="font-mono text-[0.5625rem] leading-none tracking-[0.12em] text-future-stage-muted uppercase">
                  Finished manuscript
                </span>
                <span className="flex min-h-0 flex-1 items-center py-3">
                  <span
                    data-slot="completion-book-title"
                    className={`w-full font-display font-semibold break-words text-balance [overflow-wrap:anywhere] ${titleSize(displayTitle)}`}
                  >
                    {displayTitle}
                  </span>
                </span>
                <span className="border-t border-future-stage-muted/25 pt-2 font-mono text-[0.5625rem] leading-none tracking-[0.08em] text-future-stage-muted uppercase">
                  {chapterCount} {chapterCount === 1 ? "chapter" : "chapters"} · complete
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-balance">
          {includedStory ? "Your short story is written." : "Your book is written."}
        </h2>
        {recommendation ? (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{recommendation}</p>
        ) : null}
        {review ? (
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            continuity score {review.score.toFixed(2)} ·{" "}
            {review.issueCount === 1 ? "1 note" : `${review.issueCount} notes`}
          </p>
        ) : null}
      </div>

      {notices && notices.length > 0 ? (
        // The book is finished, so this is a caveat and not a failure: ember
        // (the warning role) rather than a destructive treatment, and placed
        // under the headline instead of replacing it.
        <section
          aria-labelledby="completion-notices-title"
          className="mx-auto max-w-md rounded-sm border border-ember/40 bg-ember/8 px-4 py-3 text-left"
        >
          <h3 id="completion-notices-title" className="text-sm font-semibold">
            {notices.length === 1
              ? "One finishing step was skipped"
              : `${notices.length} finishing steps were skipped`}
          </h3>
          <ul className="mt-1 space-y-1">
            {notices.map((notice) => (
              <li key={notice.code} className="text-xs leading-relaxed text-muted-foreground">
                {notice.message}
              </li>
            ))}
          </ul>
          {consistencyReviewSkipped ? <ConsistencyReviewAction projectId={projectId} /> : null}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button render={<Link href={`/projects/${projectId}/manuscript`} />} nativeButton={false}>
          Open your manuscript
        </Button>
        <Button
          variant="outline"
          render={<Link href={`/projects/${projectId}/editor`} />}
          nativeButton={false}
        >
          Start editing
        </Button>
        {canWriteAgain ? (
          <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
            Write again
          </Button>
        ) : null}
      </div>

      {includedStory ? (
        <section
          aria-labelledby="full-book-next-step-title"
          className="mt-2 grid w-full max-w-3xl gap-5 border-t border-border pt-7 text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
          <div>
            <p className="folio-label text-ai">Next production</p>
            <h3
              id="full-book-next-step-title"
              className="mt-2 text-lg font-semibold tracking-[-0.02em]"
            >
              {fullBookUnlocked
                ? "Take this story to full length."
                : "Ready to write a full-length book?"}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {fullBookUnlocked
                ? "This story stays intact. Its title, genre, and brief are ready in a new full-length setup with editable chapter count, length, and quality."
                : `${INCLUDED_STORY_NO_CARD_NOTE} ${FULL_BOOK_UNLOCK_DESCRIPTION} After checkout, this title, genre, and brief will be ready in a new full-length setup.`}
            </p>
          </div>
          <Button
            render={
              <Link
                href={
                  fullBookUnlocked ? fullBookSetupHref(projectId) : fullBookUnlockHref(projectId)
                }
              />
            }
            nativeButton={false}
            className="w-fit"
          >
            {fullBookUnlocked ? "Continue at full length" : "Unlock the full-length version"}
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Button>
        </section>
      ) : null}

      {canWriteAgain && onWriteAgain ? (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Replace this manuscript with a new draft?</AlertDialogTitle>
              <AlertDialogDescription>
                This starts a new paid production run using your latest project settings. Current
                chapter prose is saved as a dated snapshot before replacement. If a shorter run
                retires surplus chapters, you can restore their latest archived drafts from the
                Editorial workbench.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {writeAgainError ? (
              <p role="alert" className="px-6 text-sm text-destructive">
                {writeAgainError}
              </p>
            ) : null}
            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  if (!writeAgainPending) setConfirmOpen(false);
                }}
                aria-disabled={writeAgainPending}
              >
                Keep this manuscript
              </Button>
              <Button
                onClick={() => {
                  if (!writeAgainPending) onWriteAgain();
                }}
                aria-busy={writeAgainPending || undefined}
                aria-disabled={writeAgainPending}
              >
                {writeAgainPending ? <Spinner aria-hidden="true" /> : null}
                {writeAgainPending ? "Starting…" : "Start new draft"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  );
}

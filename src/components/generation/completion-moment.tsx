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

/**
 * The completion moment: the chapter rail closes into a single spine bearing
 * the book's title. Pure CSS transforms; the global reduced-motion rules
 * collapse the choreography into an instant crossfade.
 */
export function CompletionMoment({
  projectId,
  projectTitle,
  chapterCount,
  recommendation,
  experience = "full_book",
  fullBookUnlocked = false,
  review,
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
  onWriteAgain?: () => void;
  writeAgainPending?: boolean;
  writeAgainError?: string | null;
}) {
  const [closed, setClosed] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

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

  return (
    <section
      aria-label={includedStory ? "Story complete" : "Book complete"}
      className="instrument-surface-raised flex flex-col items-center gap-8 rounded-sm px-6 py-12"
    >
      <div className="relative flex h-40 items-center justify-center">
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
          <div className="flex h-36 w-11 items-center justify-center overflow-hidden rounded-md bg-primary px-1 ring-1 ring-primary/40 ring-offset-4 ring-offset-background">
            <span
              className="max-h-32 truncate font-display text-sm font-semibold text-primary-foreground [writing-mode:vertical-rl]"
              title={projectTitle}
            >
              {projectTitle}
            </span>
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

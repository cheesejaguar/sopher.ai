"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { startConsistencyReview } from "@/lib/actions/continuity";

/**
 * The two skipped-pass codes a re-review can actually fix. Mirrored from
 * DEGRADATION_CODES rather than imported: that module reaches the database
 * through authoring-cancellation, and this is a client component.
 */
export const CONSISTENCY_REVIEW_NOTICE_CODES = [
  "continuity_review_unavailable",
  "continuity_review_partial",
];

export function isConsistencyReviewSkipped(codes: readonly string[] | undefined): boolean {
  return codes?.some((code) => CONSISTENCY_REVIEW_NOTICE_CODES.includes(code)) ?? false;
}

type ReviewState = { kind: "idle" } | { kind: "started" } | { kind: "error"; message: string };

/**
 * The offer to re-run the one skipped pass an author can get back.
 *
 * Lives in its own client component because it belongs in two places: the live
 * completion moment, and the manuscript page — which is the durable one, since
 * the completion moment rides the event stream and dies with the tab.
 */
export function ConsistencyReviewAction({ projectId }: { projectId: string }) {
  const [state, setState] = React.useState<ReviewState>({ kind: "idle" });
  const [pending, start] = React.useTransition();

  const run = () => {
    if (pending) return;
    setState({ kind: "idle" });
    start(async () => {
      try {
        const result = await startConsistencyReview({
          projectId,
          // A fresh key per press. The previous one may already belong to a run
          // that could not be handed off, and replaying it would hand back that
          // dead run instead of starting a review.
          requestKey: crypto.randomUUID(),
        });
        setState(
          result.status === "started" || result.status === "reattached"
            ? { kind: "started" }
            : { kind: "error", message: result.message },
        );
      } catch {
        setState({
          kind: "error",
          message: "The review couldn’t be started. Please try again.",
        });
      }
    });
  };

  return (
    <div className="mt-3 border-t border-ember/30 pt-3">
      {state.kind === "started" ? (
        <p role="status" className="text-xs leading-relaxed text-muted-foreground">
          We’re re-reading your book for consistency. It takes a few minutes — the notes will appear
          in your{" "}
          <Link href={`/projects/${projectId}/bible`} className="underline">
            story bible
          </Link>{" "}
          when it finishes.
        </p>
      ) : (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={run}
            aria-busy={pending || undefined}
            aria-disabled={pending}
          >
            {pending ? <Spinner aria-hidden="true" /> : null}
            {pending ? "Starting…" : "Run the consistency review"}
          </Button>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            This reads your whole manuscript again and uses credits. Your chapters are not changed.
          </p>
        </>
      )}
      {state.kind === "error" ? (
        <p role="alert" className="mt-2 text-xs leading-relaxed text-destructive">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

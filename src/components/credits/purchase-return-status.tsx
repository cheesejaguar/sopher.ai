"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function PurchaseReturnStatus({
  purchaseConfirmed,
  continueTo,
  resumeRunId = null,
  resumeReady = false,
  resumeNoLongerNeeded = false,
  balance = null,
  requiredCredits = null,
}: {
  purchaseConfirmed: boolean;
  continueTo: Route;
  resumeRunId?: string | null;
  resumeReady?: boolean;
  resumeNoLongerNeeded?: boolean;
  balance?: number | null;
  requiredCredits?: number | null;
}) {
  const router = useRouter();
  const [automaticChecks, setAutomaticChecks] = React.useState(0);
  const [resumeError, setResumeError] = React.useState<string | null>(null);
  const resumeAttempted = React.useRef(false);
  const carryingIncludedStory =
    typeof continueTo === "string" && continueTo.startsWith("/studio/new?from=");
  const resumingSavedSetup =
    typeof continueTo === "string" && continueTo === "/studio/new?resume=checkout";
  const waitingForRunBalance =
    purchaseConfirmed && resumeRunId !== null && !resumeReady && !resumeNoLongerNeeded;
  const confirmationReady =
    purchaseConfirmed && (resumeRunId ? resumeReady || resumeNoLongerNeeded : true);

  React.useEffect(() => {
    if (purchaseConfirmed || automaticChecks >= 15) return;
    const timer = window.setTimeout(() => {
      setAutomaticChecks((count) => count + 1);
      router.refresh();
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [automaticChecks, purchaseConfirmed, router]);

  React.useEffect(() => {
    if (!resumeRunId || !confirmationReady || resumeAttempted.current) return;
    resumeAttempted.current = true;
    if (resumeNoLongerNeeded) {
      router.replace(continueTo);
      return;
    }
    void fetch(`/api/runs/${resumeRunId}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "credits-topup" }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.ok) {
          router.replace(continueTo);
          return;
        }
        if (response.status === 409) {
          // The run may have resumed in another tab while checkout returned.
          router.replace(continueTo);
          return;
        }
        throw new Error(body.error ?? "The saved run could not resume");
      })
      .catch((error: unknown) => {
        setResumeError(error instanceof Error ? error.message : "The saved run could not resume");
      });
  }, [confirmationReady, continueTo, resumeNoLongerNeeded, resumeRunId, router]);

  return (
    <section
      aria-labelledby="purchase-return-title"
      className="rounded-md border border-ai/40 bg-ai-soft px-4 py-4 text-sm text-ai"
    >
      <h2 id="purchase-return-title" className="font-semibold">
        {confirmationReady
          ? resumeRunId
            ? resumeNoLongerNeeded
              ? "This writing pause is already resolved."
              : "Your balance is ready. Resuming writing…"
            : carryingIncludedStory
              ? "Your story is ready to go full length."
              : resumingSavedSetup
                ? "Your balance is ready."
                : "Full-length books are unlocked."
          : waitingForRunBalance
            ? "Purchase confirmed. More credits are needed."
            : "Confirming purchase."}
      </h2>
      <p role="status" aria-live="polite" className="mt-1 text-foreground">
        {confirmationReady
          ? resumeRunId
            ? resumeNoLongerNeeded
              ? "The saved run no longer needs a credit response. Returning to its current state."
              : "The saved credit pause is being answered automatically. You will return to the same Write room."
            : carryingIncludedStory
              ? "Your credit balance is ready. Continue with the included story’s title, genre, and brief already carried into setup."
              : resumingSavedSetup
                ? "Return to the final confirmation with your saved title, brief, shape, and quality intact."
                : "Your credit balance is ready, and full-length controls stay unlocked for future projects."
          : waitingForRunBalance && requiredCredits !== null && balance !== null
            ? `The purchase settled, but the saved run needs ${requiredCredits.toFixed(2)} credits and currently has ${balance.toFixed(2)}. Choose another pack below; your saved work is safe.`
            : automaticChecks >= 15
              ? "Stripe confirmation is taking longer than usual. Your payment is safe; check again without purchasing twice."
              : "Stripe is confirming the charge. This page checks automatically; it usually takes only a few seconds."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirmationReady && !resumeRunId ? (
          <Button render={<Link href={continueTo} />} nativeButton={false}>
            {carryingIncludedStory
              ? "Continue this story at full length"
              : resumingSavedSetup
                ? "Return to final confirmation"
                : "Continue to full-length setup"}
          </Button>
        ) : confirmationReady && resumeRunId ? (
          <>
            <Button disabled aria-disabled="true">
              <Spinner aria-hidden="true" />
              {resumeError ? "Resume needs attention" : "Resuming writing…"}
            </Button>
            {resumeError ? (
              <Button render={<Link href={continueTo} />} nativeButton={false} variant="outline">
                Return to the saved run
              </Button>
            ) : null}
          </>
        ) : waitingForRunBalance ? (
          <Button render={<Link href="#packs-heading" />} nativeButton={false}>
            Add enough credits
          </Button>
        ) : (
          <>
            <Button disabled aria-disabled="true">
              <Spinner aria-hidden="true" />
              Confirming purchase…
            </Button>
            <Button variant="outline" onClick={() => router.refresh()}>
              Check now
            </Button>
          </>
        )}
      </div>
      {resumeError ? (
        <p role="alert" className="mt-2 text-destructive">
          {resumeError}. Your saved work and purchase remain safe.
        </p>
      ) : null}
    </section>
  );
}

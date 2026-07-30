"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function PurchaseReturnStatus({
  unlocked,
  continueTo,
}: {
  unlocked: boolean;
  continueTo: Route;
}) {
  const router = useRouter();
  const [automaticChecks, setAutomaticChecks] = React.useState(0);
  const carryingIncludedStory =
    typeof continueTo === "string" && continueTo.startsWith("/studio/new?from=");

  React.useEffect(() => {
    if (unlocked || automaticChecks >= 15) return;
    const timer = window.setTimeout(() => {
      setAutomaticChecks((count) => count + 1);
      router.refresh();
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [automaticChecks, router, unlocked]);

  return (
    <section
      aria-labelledby="purchase-return-title"
      className="rounded-md border border-ai/40 bg-ai-soft px-4 py-4 text-sm text-ai"
    >
      <h2 id="purchase-return-title" className="font-semibold">
        {unlocked
          ? carryingIncludedStory
            ? "Your story is ready to go full length."
            : "Full-length books are unlocked."
          : "Payment received."}
      </h2>
      <p role="status" aria-live="polite" className="mt-1 text-foreground">
        {unlocked
          ? carryingIncludedStory
            ? "Your credit balance is ready. Continue with the included story’s title, genre, and brief already carried into setup."
            : "Your credit balance is ready, and full-length controls stay unlocked for future projects."
          : automaticChecks >= 15
            ? "Stripe confirmation is taking longer than usual. Your payment is safe; check again without purchasing twice."
            : "Stripe is confirming the charge. This page checks automatically; it usually takes only a few seconds."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {unlocked ? (
          <Button render={<Link href={continueTo} />} nativeButton={false}>
            {carryingIncludedStory
              ? "Continue this story at full length"
              : "Continue to full-length setup"}
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
    </section>
  );
}

"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CreditPack } from "@/lib/billing/credits-shared";
import { PUBLIC_BOOK_WORDS, PUBLIC_TIER_COSTS } from "@/lib/billing/public-pricing";
import { track } from "@/lib/analytics/track";
import { SUSPENDED_AUTHORING_MESSAGE } from "@/components/studio/studio-access-context";

/** Starts Stripe Checkout. Credits are granted by the webhook, never here. */
export function PackButtons({
  packs,
  returnTo,
  unlockingFullBook = false,
  recommendedCredits,
  suspended = false,
}: {
  packs: CreditPack[];
  returnTo?: string;
  unlockingFullBook?: boolean;
  /** Additional balance the current saved action needs, used only to highlight a pack. */
  recommendedCredits?: number;
  suspended?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recommendedPackId =
    recommendedCredits !== undefined && recommendedCredits > 0
      ? ([...packs]
          .sort((left, right) => left.credits - right.credits)
          .find((pack) => pack.credits >= recommendedCredits)?.id ??
        [...packs].sort((left, right) => right.credits - left.credits)[0]?.id)
      : unlockingFullBook
        ? "author"
        : null;

  async function buy(packId: string) {
    if (suspended) return;
    setBusy(packId);
    setError(null);
    // Fired before the request, not after: the success path is a full-page
    // handoff to Stripe, so anything after window.location.assign may not run.
    const pack = packs.find((p) => p.id === packId);
    track("begin_checkout", {
      packId,
      ...(pack ? { usd: pack.usd, credits: pack.credits } : {}),
    });
    try {
      const response = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, returnTo }),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setError(typeof body.error === "string" ? body.error : "Could not start checkout");
        setBusy(null);
        return;
      }
      // Stripe Checkout is a full-page handoff, not a client route.
      window.location.assign(body.url);
    } catch {
      setError("Could not start checkout");
      setBusy(null);
    }
  }

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {packs.map((pack) => (
          <li key={pack.id}>
            <div className="instrument-surface relative flex h-full flex-col rounded-sm p-5">
              <div className="flex min-h-5 items-start justify-between gap-3">
                <p className="folio-label text-muted-foreground">{pack.name}</p>
                {pack.id === recommendedPackId ? (
                  <span className="rounded-full border border-ai/35 bg-ai-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-ai">
                    Recommended
                  </span>
                ) : null}
              </div>
              <p className="mt-4 font-mono text-3xl font-semibold tracking-[-0.03em] tabular-nums">
                {pack.credits}
                <span className="ml-2 text-sm font-medium tracking-normal text-muted-foreground">
                  credits
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                ${pack.usd}
                {pack.bonus > 0 ? (
                  <span className="text-ai"> · {Math.round(pack.bonus * 100)}% bonus</span>
                ) : null}
              </p>
              {unlockingFullBook ? (
                <p className="mt-4 flex-1 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
                  {pack.id === "starter"
                    ? `Sized for the illustrative ${PUBLIC_BOOK_WORDS.toLocaleString("en-US")}-word Draft tier at about ${PUBLIC_TIER_COSTS.draft.credits} credits; Standard is about ${PUBLIC_TIER_COSTS.standard.credits}.`
                    : pack.id === "author"
                      ? `Covers the illustrative ${PUBLIC_BOOK_WORDS.toLocaleString("en-US")}-word Standard book at about ${PUBLIC_TIER_COSTS.standard.credits} credits, with room for editing tools.`
                      : "For more than one production or a longer editing runway."}{" "}
                  Your setup shows the exact quote before anything runs.
                </p>
              ) : null}
              <Button
                type="button"
                className="mt-4 w-full"
                variant={pack.id === recommendedPackId ? "default" : "outline"}
                onClick={() => buy(pack.id)}
                disabled={busy !== null || suspended}
                aria-label={
                  busy === pack.id
                    ? `Opening checkout for ${pack.name}`
                    : `Buy ${pack.name}: ${pack.credits} credits for $${pack.usd}`
                }
              >
                {busy === pack.id ? (
                  <>
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Opening checkout…
                  </>
                ) : (
                  `${unlockingFullBook ? "Choose" : "Buy"} ${pack.name}`
                )}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {suspended ? (
        <p className="mt-3 border-y border-destructive/35 py-3 text-sm text-foreground">
          {SUSPENDED_AUTHORING_MESSAGE}{" "}
          <a
            href="mailto:support@sopher.ai?subject=Suspended%20account%20help"
            className="font-medium underline underline-offset-4"
          >
            Contact support.
          </a>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}

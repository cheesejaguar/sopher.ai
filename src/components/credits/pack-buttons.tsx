"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CreditPack } from "@/lib/billing/credits";

/** Starts Stripe Checkout. Credits are granted by the webhook, never here. */
export function PackButtons({ packs }: { packs: CreditPack[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(packId: string) {
    setBusy(packId);
    setError(null);
    try {
      const response = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
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
            <div className="flex h-full flex-col rounded-lg border border-border bg-card p-5">
              <h3 className="font-sans font-semibold">{pack.name}</h3>
              <p className="mt-1 font-display text-3xl font-semibold tabular-nums">${pack.usd}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="tabular-nums">{pack.credits}</span> credits
                {pack.bonus > 0 ? (
                  <span className="text-ai"> · {Math.round(pack.bonus * 100)}% bonus</span>
                ) : null}
              </p>
              <Button
                type="button"
                className="mt-4 w-full"
                variant={pack.id === "author" ? "default" : "outline"}
                onClick={() => buy(pack.id)}
                disabled={busy !== null}
              >
                {busy === pack.id ? (
                  <>
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Opening checkout…
                  </>
                ) : (
                  "Buy credits"
                )}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}

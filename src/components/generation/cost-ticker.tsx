"use client";

import { CircleDollarSign } from "lucide-react";

import { cn } from "@/lib/utils";

import { CREDIT_MARKUP } from "@/lib/billing/credits-shared";

/** Credits are what the wallet is debited — always the primary figure. */
function credits(value: number): string {
  return `${(value * CREDIT_MARKUP).toFixed(1)} cr`;
}

/**
 * Live metered spend for this run. Ember is reserved for cost — the numbers
 * only turn warm when the run exceeds its estimate.
 */
export function CostTicker({ totalUsd, estimateUsd }: { totalUsd: number; estimateUsd: number }) {
  const over = totalUsd > estimateUsd;

  return (
    <section
      aria-label="Run spend"
      className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
    >
      <div className="flex items-center gap-2">
        <CircleDollarSign aria-hidden="true" className="size-3.5 text-ember" />
        <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Spend this run
        </h3>
      </div>
      <p
        className={cn(
          "mt-1.5 font-mono text-2xl font-medium tabular-nums",
          over ? "text-ember" : "text-foreground",
        )}
      >
        {credits(totalUsd)}
      </p>
      <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
        estimated {credits(estimateUsd)}
        {over ? <span className="text-ember"> · over estimate</span> : null}
      </p>
    </section>
  );
}

"use client";

import { CircleDollarSign } from "lucide-react";

import { CostDisplay } from "@/components/studio/product-primitives";
import { creditsForUsd } from "@/lib/billing/credits-shared";

/**
 * Live metered spend for this run. Ember is reserved for cost — the numbers
 * only turn warm when the run exceeds its estimate.
 */
export function CostTicker({
  totalCredits,
  totalUsd,
  estimateUsd,
}: {
  totalCredits: number;
  totalUsd: number;
  estimateUsd: number;
}) {
  const over = totalCredits > creditsForUsd(estimateUsd);

  return (
    <section aria-label="Run spend" className="instrument-surface rounded-sm px-4 py-4">
      <div className="mb-3 flex items-center gap-2 border-b border-border pb-3">
        <CircleDollarSign aria-hidden="true" className="size-3.5 text-ember" />
        <h3 className="folio-label text-muted-foreground">Spend this run</h3>
      </div>
      <CostDisplay
        credits={totalCredits}
        usd={totalUsd}
        label="Credits used"
        valueClassName={over ? "text-ember" : undefined}
        note={`Estimated ${creditsForUsd(estimateUsd).toFixed(1)} credits${
          over ? " · over estimate" : ""
        }`}
      />
    </section>
  );
}

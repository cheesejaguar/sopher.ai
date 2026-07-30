import type { BookEstimate } from "@/ai/estimate";
import { cn } from "@/lib/utils";
import { creditsForUsd } from "@/lib/billing/credits-shared";
import { formatCredits, formatUsd } from "./format";

/**
 * "Estimate vs actual" receipt: the transparent per-stage estimate on one
 * side, metered spend on the other, with the running difference.
 */
export function EstimateReceipt({
  estimate,
  actualUsd,
}: {
  estimate: BookEstimate;
  actualUsd: number;
}) {
  const delta = actualUsd - estimate.totalUsd;
  const over = delta > 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="instrument-surface rounded-sm p-4">
        <h3 className="text-sm font-medium">Estimate</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {estimate.chapters} chapters · ~{estimate.wordsPerChapter.toLocaleString("en-US")} words
          each · {estimate.tier} tier · ±30%
        </p>
        <dl className="mt-3 space-y-1.5">
          {estimate.stages.map((stage) => (
            <div key={stage.stage} className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-muted-foreground">{stage.stage}</dt>
              <dd className="text-right font-mono text-sm tabular-nums">
                <span className="block">{formatCredits(creditsForUsd(stage.usd))}</span>
                <span className="block text-[0.65rem] text-muted-foreground">
                  {formatUsd(stage.usd)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex items-baseline justify-between border-t pt-2">
          <span className="text-sm font-medium">Estimated total</span>
          <span className="text-right font-mono text-sm tabular-nums">
            <span className="block">~{formatCredits(creditsForUsd(estimate.totalUsd))}</span>
            <span className="block text-[0.65rem] font-normal text-muted-foreground">
              {formatUsd(estimate.totalUsd)} metered
            </span>
          </span>
        </div>
      </div>

      <div className="instrument-surface flex flex-col justify-between rounded-sm p-4">
        <div>
          <h3 className="text-sm font-medium">Actual so far</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Metered per model call, updated live during generation.
          </p>
        </div>
        <p className="py-6 text-center font-mono text-3xl tabular-nums">
          <span className="text-ember">{formatCredits(creditsForUsd(actualUsd))}</span>
          <span className="mt-1 block text-[0.68rem] text-muted-foreground">
            {formatUsd(actualUsd)} metered
          </span>
        </p>
        <p
          className={cn(
            "border-t pt-2 text-right font-mono text-xs tabular-nums",
            over ? "text-ember" : "text-muted-foreground",
          )}
        >
          {formatCredits(creditsForUsd(Math.abs(delta)))} {over ? "over" : "under"} estimate
        </p>
      </div>
    </div>
  );
}

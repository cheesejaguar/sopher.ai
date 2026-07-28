import type { BookEstimate } from "@/ai/estimate";
import { cn } from "@/lib/utils";
import { formatUsd } from "./format";

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
      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h3 className="text-sm font-medium">Estimate</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {estimate.chapters} chapters · ~{estimate.wordsPerChapter.toLocaleString("en-US")} words
          each · {estimate.tier} tier · ±30%
        </p>
        <dl className="mt-3 space-y-1.5">
          {estimate.stages.map((stage) => (
            <div key={stage.stage} className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-muted-foreground">{stage.stage}</dt>
              <dd className="font-mono text-sm tabular-nums">{formatUsd(stage.usd)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex items-baseline justify-between border-t pt-2">
          <span className="text-sm font-medium">Estimated total</span>
          <span className="font-mono text-sm tabular-nums">~{formatUsd(estimate.totalUsd)}</span>
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div>
          <h3 className="text-sm font-medium">Actual so far</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Metered per model call, updated live during generation.
          </p>
        </div>
        <p className="py-6 text-center font-mono text-3xl tabular-nums">
          <span className="text-ember">{formatUsd(actualUsd)}</span>
        </p>
        <p
          className={cn(
            "border-t pt-2 text-right font-mono text-xs tabular-nums",
            over ? "text-ember" : "text-muted-foreground",
          )}
        >
          {formatUsd(Math.abs(delta))} {over ? "over" : "under"} estimate
        </p>
      </div>
    </div>
  );
}

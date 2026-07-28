import { cn } from "@/lib/utils";

/**
 * Monthly budget meter. Ember (cost color) once past the alert threshold,
 * primary before it. Server-renderable — plain divs with progressbar semantics.
 */
export function BudgetBar({
  pct,
  warnAtPct = 80,
  className,
}: {
  pct: number;
  warnAtPct?: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const warned = clamped >= warnAtPct;
  // The bar swaps to the cost colour past the threshold; aria-valuetext is what
  // carries that same fact in words, since hue alone conveys nothing.
  const valueText = warned
    ? `${Math.round(pct)}% of the monthly budget used — past the ${Math.round(warnAtPct)}% alert threshold`
    : `${Math.round(pct)}% of the monthly budget used`;
  return (
    <div
      role="progressbar"
      aria-label="Monthly budget used"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-valuetext={valueText}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full transition-all", warned ? "bg-ember" : "bg-primary")}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

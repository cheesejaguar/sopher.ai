import type { RunEvent } from "@/lib/run-events";

/** Keep provider expense and author wallet debits as two explicit measures. */
export function runCostEvent(providerUsd: number, usageCredits: number): RunEvent {
  return {
    type: "cost",
    totalUsd: providerUsd,
    totalCredits: usageCredits,
  };
}

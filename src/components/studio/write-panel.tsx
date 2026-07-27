import { Check, CircleDollarSign } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatUsd, MONTHLY_BUDGET_USD, MONTHLY_SPEND_USD } from "@/lib/placeholder-data";

type StageState = "done" | "active" | "pending";

const stages: { label: string; state: StageState }[] = [
  { label: "Concept", state: "done" },
  { label: "Outline", state: "done" },
  { label: "Chapters", state: "active" },
  { label: "Edit", state: "pending" },
  { label: "Continuity", state: "pending" },
];

function StageMark({ label, state }: { label: string; state: StageState }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full border",
          state === "done" && "border-primary bg-primary text-primary-foreground",
          state === "active" && "border-ai text-ai",
          state === "pending" && "border-border text-muted-foreground",
        )}
      >
        {state === "done" ? (
          <Check aria-hidden="true" className="size-3" />
        ) : state === "active" ? (
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-ai motion-safe:animate-pulse"
          />
        ) : null}
      </span>
      <span
        className={cn(
          "text-xs font-medium whitespace-nowrap",
          state === "active"
            ? "text-ai"
            : state === "done"
              ? "text-foreground"
              : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** Static placeholder for the live generation experience (a later phase). */
export function WritePanel() {
  const remaining = MONTHLY_BUDGET_USD - MONTHLY_SPEND_USD;

  return (
    <div className="space-y-4">
      <ol
        aria-label="Generation stages"
        className="flex items-center gap-3 overflow-x-auto rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
      >
        {stages.map((stage, index) => (
          <li key={stage.label} className="flex min-w-0 flex-1 items-center gap-3">
            <StageMark label={stage.label} state={stage.state} />
            {index < stages.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "h-px min-w-4 flex-1",
                  stage.state === "done" ? "bg-primary/40" : "bg-border",
                )}
              />
            ) : null}
          </li>
        ))}
      </ol>

      <div className="paper-surface flex min-h-72 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <p className="prose-manuscript stream-caret text-paper-muted">
          Generation will stream here
        </p>
        <p className="max-w-sm font-sans text-xs text-paper-muted">
          Chapter drafts arrive word by word as the writers work. You can pause between chapters,
          reroll a scene, or stop the run at any point.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Awaiting a run</span>
        <span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-mono text-xs tabular-nums">
          <CircleDollarSign aria-hidden="true" className="size-3.5 text-ember" />
          $0.00 this run
          <span className="text-muted-foreground">· {formatUsd(remaining)} budget left</span>
        </span>
      </div>
    </div>
  );
}

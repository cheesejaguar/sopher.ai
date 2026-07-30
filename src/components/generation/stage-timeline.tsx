"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import type { Stage } from "@/lib/run-events";
import type { QualityTier } from "@/ai/models";

type StepState = "done" | "active" | "pending";

/** Step state is drawn with colour + a glyph; screen readers get this word. */
const STEP_STATE_TEXT: Record<StepState, string> = {
  done: "complete",
  active: "in progress",
  pending: "not started",
};

type Step = {
  key: string;
  label: string;
  /** Stages that mean this step is currently underway. */
  stages: Stage[];
};

/**
 * Honest pipeline view: every mark derives from the run's Stage events.
 * Draft-tier runs skip the editing pass, so that step is omitted entirely
 * rather than shown as instantly "done".
 */
function buildSteps(tier: QualityTier): Step[] {
  const steps: Step[] = [
    { key: "concept", label: "Concept", stages: ["concept"] },
    { key: "outline", label: "Outline", stages: ["outline", "awaiting_approval"] },
    { key: "chapters", label: "Chapters", stages: ["chapters", "awaiting_credits"] },
  ];
  if (tier !== "draft") steps.push({ key: "editing", label: "Editing", stages: ["editing"] });
  steps.push({ key: "continuity", label: "Continuity", stages: ["continuity", "revising"] });
  steps.push({ key: "finishing", label: "Finishing", stages: ["finalizing"] });
  return steps;
}

const STAGE_RANK: Record<Stage, number> = {
  queued: 0,
  concept: 1,
  outline: 2,
  awaiting_approval: 2,
  chapters: 3,
  awaiting_credits: 3,
  editing: 4,
  continuity: 5,
  revising: 5,
  finalizing: 6,
  done: 7,
  failed: 7,
  cancelled: 7,
};

function stepState(step: Step, stage: Stage): StepState {
  if (step.stages.includes(stage)) return "active";
  const stepRank = Math.min(...step.stages.map((s) => STAGE_RANK[s]));
  return STAGE_RANK[stage] > stepRank ? "done" : "pending";
}

function StageMark({ label, state, note }: { label: string; state: StepState; note?: string }) {
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
      <span className="flex min-w-0 flex-col">
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
          <span className="sr-only"> — {STEP_STATE_TEXT[state]}</span>
        </span>
        {note ? (
          <span className="text-[10px] whitespace-nowrap text-muted-foreground">{note}</span>
        ) : null}
      </span>
    </div>
  );
}

export function StageTimeline({
  stage,
  pct,
  detail,
  tier,
  draftingCount,
  plannedTotal,
}: {
  stage: Stage;
  pct: number;
  detail?: string;
  tier: QualityTier;
  draftingCount: number;
  plannedTotal: number;
}) {
  const steps = buildSteps(tier);
  const parallelNote =
    draftingCount > 0 && plannedTotal > 0
      ? `${draftingCount} of ${plannedTotal} drafting`
      : undefined;
  const activeStep = steps.find((step) => stepState(step, stage) === "active");
  // The bar is the only place the number lives visually, so spell it out for
  // screen readers together with the step it belongs to.
  const progressValueText = activeStep
    ? `${Math.round(pct)}% complete — ${activeStep.label}`
    : `${Math.round(pct)}% complete`;

  return (
    <section aria-label="Generation progress" className="space-y-3">
      {/* Scrolls sideways on narrow viewports, so it needs to be reachable by
          keyboard — it holds no focusable children of its own. */}
      <ol
        tabIndex={0}
        role="region"
        aria-label="Generation stage timeline"
        className="instrument-surface flex items-center gap-3 overflow-x-auto rounded-sm px-4 py-3"
      >
        {steps.map((step, index) => {
          const state = stepState(step, stage);
          return (
            <li key={step.key} className="flex min-w-0 flex-1 items-center gap-3">
              <StageMark
                label={step.label}
                state={state}
                note={step.key === "chapters" && state === "active" ? parallelNote : undefined}
              />
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-px min-w-4 flex-1",
                    state === "done" ? "bg-primary/40" : "bg-border",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="flex items-center gap-3">
        <Progress
          value={Math.round(pct)}
          aria-label="Overall progress"
          aria-valuetext={progressValueText}
          className="min-w-0 flex-1"
        />
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {Math.round(pct)}%
        </span>
      </div>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </section>
  );
}

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
    { key: "bible", label: "Story bible", stages: ["bible"] },
    { key: "chapters", label: "Chapters", stages: ["chapters"] },
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
  bible: 3,
  chapters: 4,
  awaiting_credits: 4,
  editing: 5,
  continuity: 6,
  revising: 6,
  finalizing: 7,
  done: 8,
  failed: 8,
  cancelled: 8,
};

function stepState(step: Step, stage: Stage): StepState {
  if (step.stages.includes(stage)) return "active";
  const stepRank = Math.min(...step.stages.map((s) => STAGE_RANK[s]));
  return STAGE_RANK[stage] > stepRank ? "done" : "pending";
}

function StageMark({ label, state, note }: { label: string; state: StepState; note?: string }) {
  return (
    <div
      aria-current={state === "active" ? "step" : undefined}
      data-state={state}
      className="flex shrink-0 items-center gap-2"
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full border",
          state === "done" && "border-primary bg-primary text-primary-foreground",
          state === "active" &&
            "border-ai text-ai forced-colors:outline forced-colors:outline-2 forced-colors:outline-offset-2",
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
              ? "text-ai forced-colors:underline forced-colors:decoration-2"
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
  detail,
  pausedStage,
  tier,
  draftingCount,
  plannedTotal,
}: {
  stage: Stage;
  pct: number;
  detail?: string;
  pausedStage?: Stage;
  tier: QualityTier;
  draftingCount: number;
  plannedTotal: number;
}) {
  const steps = buildSteps(tier);
  // New runs identify the exact work phase blocked by the credit gate. Older
  // events may not, so leave the pipeline unstarted instead of inferring a
  // phase from an internal orchestration percentage.
  const displayStage: Stage = stage === "awaiting_credits" ? (pausedStage ?? "queued") : stage;
  const parallelNote =
    draftingCount > 0 && plannedTotal > 0
      ? `${draftingCount} of ${plannedTotal} drafting`
      : undefined;
  const activeStep = steps.find((step) => stepState(step, displayStage) === "active");
  const activeIndex = activeStep ? steps.indexOf(activeStep) : -1;
  const pipelineFinished = stage === "done";
  const pipelineStopped = stage === "failed" || stage === "cancelled";
  const pipelineValue = pipelineFinished
    ? 100
    : activeIndex >= 0
      ? Math.round(((activeIndex + 1) / steps.length) * 100)
      : 0;
  const pipelinePosition =
    activeIndex >= 0
      ? `Stage ${activeIndex + 1} of ${steps.length}: ${activeStep?.label}`
      : pipelineFinished
        ? "Pipeline finished"
        : pipelineStopped
          ? "Pipeline stopped"
          : "Pipeline preparing";

  return (
    <section aria-label="Generation progress" className="space-y-3">
      {/* Scrolls sideways on narrow viewports, so it needs to be reachable by
          keyboard — it holds no focusable children of its own. */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Generation stage timeline"
        className="instrument-surface overflow-x-auto rounded-sm px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ol className="flex min-w-max items-center gap-3">
          {steps.map((step, index) => {
            const state = stepState(step, displayStage);
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
      </div>

      <div className="flex items-center gap-3">
        <Progress
          value={pipelineValue}
          aria-label="Pipeline position"
          aria-valuetext={pipelinePosition}
          className="min-w-0 flex-1"
        />
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {activeIndex >= 0
            ? `${activeIndex + 1}/${steps.length}`
            : pipelineFinished
              ? "Done"
              : "—"}
        </span>
      </div>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </section>
  );
}

"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Feather } from "lucide-react";

import { cn } from "@/lib/utils";
import { startBook } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StepBrief } from "@/components/wizard/step-brief";
import { StepEstimate } from "@/components/wizard/step-estimate";
import { StepGenre } from "@/components/wizard/step-genre";
import { StepShape } from "@/components/wizard/step-shape";
import {
  composeBrief,
  composeTitle,
  DEFAULT_TIER_KEY,
  initialWizardState,
  maxReachableStep,
  restoreDraft,
  serializeDraft,
  stepComplete,
  WIZARD_DRAFT_KEY,
  WIZARD_STEPS,
  wizardReducer,
  type WizardActionEvent,
  type WizardState,
} from "@/components/wizard/wizard-state";

const STEP_HEADINGS: Record<(typeof WIZARD_STEPS)[number]["id"], { title: string; hint: string }> =
  {
    genre: {
      title: "Pick the shelf it belongs on",
      hint: "Structure, pacing, and conventions follow from the genre.",
    },
    brief: {
      title: "Tell the story in your own words",
      hint: "Premise, people, the feeling it should leave. A paragraph or two is plenty.",
    },
    shape: {
      title: "Give the book its shape",
      hint: "Length, voice, and the limits the writers must respect.",
    },
    estimate: {
      title: "The quote, before anything runs",
      hint: "Pick a tier and read the receipt. Nothing is generated until you start it.",
    },
  };

function FolioProgress({ state, onGoto }: { state: WizardState; onGoto: (step: number) => void }) {
  const reachable = maxReachableStep(state);
  return (
    <ol aria-label="Wizard steps" className="flex items-center gap-4">
      {WIZARD_STEPS.map((step, index) => {
        const status = index === state.step ? "current" : index <= reachable ? "open" : "locked";
        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onGoto(index)}
              disabled={status === "locked"}
              aria-current={status === "current" ? "step" : undefined}
              className="group flex items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-5 w-3.5 rounded-[2px] border transition-colors",
                  status === "current"
                    ? "border-transparent bg-primary"
                    : status === "open"
                      ? "border-transparent bg-primary/40 group-hover:bg-primary/60"
                      : "border-border bg-transparent",
                )}
              />
              <span
                className={cn(
                  "text-xs font-medium",
                  status === "current" ? "text-foreground" : "text-muted-foreground",
                  status === "locked" && "opacity-60",
                )}
              >
                {step.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

type WizardUiState = { wizard: WizardState; resumed: boolean };

type WizardUiEvent =
  WizardActionEvent | { type: "resume"; state: WizardState } | { type: "start-over" };

function uiReducer(state: WizardUiState, action: WizardUiEvent): WizardUiState {
  switch (action.type) {
    case "resume":
      return {
        wizard: wizardReducer(state.wizard, { type: "restore", state: action.state }),
        resumed: true,
      };
    case "start-over":
      return { wizard: initialWizardState, resumed: false };
    default:
      return { ...state, wizard: wizardReducer(state.wizard, action) };
  }
}

/** A draft is worth resuming only once the author has actually entered something. */
function draftHasContent(draft: WizardState): boolean {
  return draft.genre !== null || draft.brief.trim().length > 0 || draft.title.trim().length > 0;
}

export function NewBookWizard() {
  const [ui, dispatch] = React.useReducer(uiReducer, {
    wizard: initialWizardState,
    resumed: false,
  });
  const state = ui.wizard;
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const hydrated = React.useRef(false);

  // Resume a saved draft (or apply the device's default tier) once, on mount.
  React.useEffect(() => {
    const draft = restoreDraft(window.localStorage.getItem(WIZARD_DRAFT_KEY));
    if (draft && draftHasContent(draft)) {
      dispatch({ type: "resume", state: draft });
    } else {
      const tier = window.localStorage.getItem(DEFAULT_TIER_KEY);
      if (tier === "draft" || tier === "standard" || tier === "premium") {
        dispatch({ type: "patch", patch: { tier } });
      }
    }
    hydrated.current = true;
  }, []);

  // Persist the draft, debounced, so a closed tab costs nothing.
  React.useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      window.localStorage.setItem(WIZARD_DRAFT_KEY, serializeDraft(state));
    }, 300);
    return () => clearTimeout(timer);
  }, [state]);

  function handleStartOver() {
    window.localStorage.removeItem(WIZARD_DRAFT_KEY);
    dispatch({ type: "start-over" });
  }

  function handleSubmit() {
    if (!state.genre) return;
    setError(null);
    const payload = {
      title: composeTitle(state),
      brief: composeBrief(state),
      genre: state.genre,
      targetChapters: state.chapters,
      targetWordsPerChapter: state.wordsPerChapter,
      settings: {
        pov: state.pov,
        tense: state.tense,
        heatLevel: state.heatLevel,
        violenceLevel: state.violenceLevel,
        profanity: state.profanity,
        qualityTier: state.tier,
        requireOutlineApproval: state.requireOutlineApproval,
        ...(state.voiceProfile !== "none" ? { voiceProfile: state.voiceProfile } : {}),
      },
    };
    startTransition(async () => {
      // Clear the draft first — a successful action redirects away immediately.
      window.localStorage.removeItem(WIZARD_DRAFT_KEY);
      try {
        await startBook(payload);
      } catch {
        window.localStorage.setItem(WIZARD_DRAFT_KEY, serializeDraft(state));
        setError("The book could not be started. Your brief is saved — please try again.");
      }
    });
  }

  const stepId = WIZARD_STEPS[state.step].id;
  const heading = STEP_HEADINGS[stepId];
  const lastStep = state.step === WIZARD_STEPS.length - 1;
  const canAdvance = stepComplete(state, state.step);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FolioProgress state={state} onGoto={(step) => dispatch({ type: "goto", step })} />
        {ui.resumed ? (
          <p className="text-xs text-muted-foreground">
            Resumed your saved draft.{" "}
            <button
              type="button"
              onClick={handleStartOver}
              className="rounded-sm underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Start over
            </button>
          </p>
        ) : null}
      </div>

      <header className="space-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">{heading.title}</h2>
        <p className="text-sm text-muted-foreground">{heading.hint}</p>
      </header>

      {stepId === "genre" ? <StepGenre state={state} dispatch={dispatch} /> : null}
      {stepId === "brief" ? <StepBrief state={state} dispatch={dispatch} /> : null}
      {stepId === "shape" ? <StepShape state={state} dispatch={dispatch} /> : null}
      {stepId === "estimate" ? <StepEstimate state={state} dispatch={dispatch} /> : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <footer className="flex items-center justify-between gap-3 border-t pt-4">
        <Button
          variant="ghost"
          onClick={() => dispatch({ type: "back" })}
          disabled={state.step === 0 || pending}
        >
          <ArrowLeft aria-hidden="true" data-icon="inline-start" />
          Back
        </Button>
        {lastStep ? (
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Feather aria-hidden="true" data-icon="inline-start" />
            )}
            {pending ? "Starting the book…" : "Start the book"}
          </Button>
        ) : (
          <Button onClick={() => dispatch({ type: "next" })} disabled={!canAdvance}>
            Next
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Button>
        )}
      </footer>
    </div>
  );
}

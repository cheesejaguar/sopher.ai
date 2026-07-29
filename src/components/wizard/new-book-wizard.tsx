"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Feather } from "lucide-react";

import { cn } from "@/lib/utils";
import { startBook } from "@/lib/actions/projects";
import { track } from "@/lib/analytics/track";
import type { GenreId } from "@/ai/knowledge/genres";
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
        const locked = status === "locked";
        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => {
                if (!locked) onGoto(index);
              }}
              // aria-disabled rather than `disabled`: a locked step stays reachable
              // by keyboard so its name can explain why it cannot be opened yet.
              aria-disabled={locked || undefined}
              aria-current={status === "current" ? "step" : undefined}
              // `after` widens the pointer target to >=24px without changing layout,
              // matching how the UI primitives here handle small controls.
              className="group relative flex items-center gap-1.5 rounded-md outline-none after:absolute after:-inset-x-1 after:-inset-y-1.5 focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-default"
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
                  locked && "opacity-60",
                )}
              >
                {step.label}
              </span>
              <span className="sr-only">
                {` Step ${index + 1} of ${WIZARD_STEPS.length}`}
                {locked ? ", not available until the earlier steps are complete" : ""}
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

export function NewBookWizard({ initialGenre }: { initialGenre?: GenreId } = {}) {
  const [ui, dispatch] = React.useReducer(uiReducer, {
    wizard: initialWizardState,
    resumed: false,
  });
  const state = ui.wizard;
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const hydrated = React.useRef(false);
  // Set only by the step controls, so the heading is never focused on mount
  // or when a saved draft is restored.
  const stepChanged = React.useRef(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  function goToStep(action: WizardActionEvent) {
    stepChanged.current = true;
    dispatch(action);
  }

  // A wizard step is a view change: move focus to the new step's heading so
  // screen reader and keyboard users land in the content that just replaced.
  React.useEffect(() => {
    if (!stepChanged.current) return;
    stepChanged.current = false;
    headingRef.current?.focus();
  }, [state.step]);

  // Wizard progress is the only funnel stage that leaves no row behind — the
  // draft lives in localStorage until submit, so an author who gives up on the
  // shape step is otherwise indistinguishable from one who never started.
  const furthestStep = React.useRef(-1);
  React.useEffect(() => {
    if (state.step <= furthestStep.current) return;
    const from = furthestStep.current + 1;
    furthestStep.current = state.step;
    // Emits every step between the last one seen and this one, not just the
    // new one. Restoring a saved draft jumps straight to a later step, and
    // skipping the intervening ones would make the funnel non-monotonic —
    // step 3 showing more people than step 2, which reads as a bug in the
    // chart rather than in the data.
    for (let step = from; step <= state.step; step += 1) {
      track("wizard_step", {
        step,
        stepId: WIZARD_STEPS[step]?.id ?? "unknown",
        ...(step < state.step ? { inferred: true } : {}),
        ...(state.genre ? { genre: state.genre } : {}),
      });
    }
  }, [state.step, state.genre]);

  // Abandonment. Only fires when they leave mid-wizard with real content —
  // submit clears the ref first, so a completed wizard never counts as one.
  const submitted = React.useRef(false);
  React.useEffect(() => {
    function onLeave() {
      if (submitted.current || furthestStep.current < 1) return;
      track("wizard_abandon", {
        step: furthestStep.current,
        stepId: WIZARD_STEPS[furthestStep.current]?.id ?? "unknown",
      });
    }
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, []);

  // Resume a saved draft (or apply the device's default tier) once, on mount.
  React.useEffect(() => {
    const draft = restoreDraft(window.localStorage.getItem(WIZARD_DRAFT_KEY));
    if (draft && draftHasContent(draft)) {
      // A saved draft wins over the link's genre — the work they already did
      // beats a hint from the URL.
      dispatch({ type: "resume", state: draft });
    } else {
      const tier = window.localStorage.getItem(DEFAULT_TIER_KEY);
      const patch: Partial<WizardState> = {};
      if (tier === "draft" || tier === "standard" || tier === "premium") patch.tier = tier;
      // Arriving from a genre landing page: skip the question they answered by
      // clicking, and open on the brief step.
      if (initialGenre) {
        patch.genre = initialGenre;
        patch.step = 1;
      }
      if (Object.keys(patch).length > 0) dispatch({ type: "patch", patch });
    }
    hydrated.current = true;
  }, [initialGenre]);

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
      ...(state.subgenre ? { subgenre: state.subgenre } : {}),
      ...(state.protagonist.trim() ? { protagonist: state.protagonist.trim() } : {}),
      ...(state.setting.trim() ? { setting: state.setting.trim() } : {}),
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
    submitted.current = true;
    track("book_started", {
      genre: state.genre,
      tier: state.tier,
      chapters: state.chapters,
      wordsPerChapter: state.wordsPerChapter,
      outlineApproval: state.requireOutlineApproval,
    });
    startTransition(async () => {
      // Clear the draft first — a successful action redirects away immediately.
      window.localStorage.removeItem(WIZARD_DRAFT_KEY);
      try {
        const result = await startBook(payload);
        if (result?.error) {
          window.localStorage.setItem(WIZARD_DRAFT_KEY, serializeDraft(state));
          setError(result.error);
        }
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
  // Why "Next" is unavailable — the button alone does not make this obvious.
  const blockedReason =
    stepId === "genre"
      ? "Choose a genre to continue."
      : "Describe the story in a few sentences to continue.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FolioProgress state={state} onGoto={(step) => goToStep({ type: "goto", step })} />
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
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-xl font-semibold tracking-tight outline-none"
        >
          {heading.title}
          <span className="sr-only">{` — step ${state.step + 1} of ${WIZARD_STEPS.length}`}</span>
        </h2>
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
          onClick={() => goToStep({ type: "back" })}
          disabled={state.step === 0 || pending}
        >
          <ArrowLeft aria-hidden="true" data-icon="inline-start" />
          Back
        </Button>
        {lastStep ? (
          <Button
            onClick={handleSubmit}
            disabled={pending}
            // Stays focused while the book starts, so the label change is heard.
            focusableWhenDisabled
            className="aria-disabled:opacity-50"
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Feather aria-hidden="true" data-icon="inline-start" />
            )}
            {pending ? "Starting the book…" : "Start the book"}
          </Button>
        ) : (
          <>
            <p id="wizard-next-hint" className="sr-only">
              {canAdvance ? "" : blockedReason}
            </p>
            <Button
              onClick={() => goToStep({ type: "next" })}
              disabled={!canAdvance}
              focusableWhenDisabled
              aria-describedby={canAdvance ? undefined : "wizard-next-hint"}
              className="aria-disabled:opacity-50"
            >
              Next
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Button>
          </>
        )}
      </footer>
    </div>
  );
}

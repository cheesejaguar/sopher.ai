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
import { StepEstimate, type WizardQuoteSummary } from "@/components/wizard/step-estimate";
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
    <ol aria-label="Wizard steps" className="grid grid-cols-2 gap-1 lg:grid-cols-1">
      {WIZARD_STEPS.map((step, index) => {
        const status = index === state.step ? "current" : index <= reachable ? "open" : "locked";
        const locked = status === "locked";
        return (
          <li key={step.id} className="min-w-0">
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
              className={cn(
                "group relative flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-default",
                status === "current" && "bg-accent",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-7 shrink-0 place-items-center border font-mono text-[0.6875rem] transition-colors",
                  status === "current"
                    ? "border-primary bg-primary text-primary-foreground"
                    : status === "open"
                      ? "border-primary/45 text-primary group-hover:border-primary"
                      : "border-border bg-transparent text-muted-foreground",
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    status === "current" ? "text-foreground" : "text-muted-foreground",
                    locked && "opacity-60",
                  )}
                >
                  {step.label}
                </span>
                <span
                  className={cn(
                    "block font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase",
                    locked && "opacity-60",
                  )}
                >
                  {status === "current" ? "Current" : status === "open" ? "Available" : "Locked"}
                </span>
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

function SetupSummary({ state, quote }: { state: WizardState; quote: WizardQuoteSummary | null }) {
  const brief = state.brief.trim();
  return (
    <dl className="space-y-3 text-xs">
      <div>
        <dt className="folio-label text-muted-foreground">Shelf</dt>
        <dd className="mt-1 font-medium capitalize">{state.genre ?? "Not chosen"}</dd>
      </div>
      <div>
        <dt className="folio-label text-muted-foreground">Brief</dt>
        <dd className="mt-1 line-clamp-3 leading-relaxed text-muted-foreground">
          {brief || "Waiting for your story."}
        </dd>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <dt className="folio-label text-muted-foreground">Shape</dt>
          <dd className="mt-1 font-mono tabular-nums">
            {state.chapters} × {state.wordsPerChapter.toLocaleString("en-US")}
          </dd>
        </div>
        <div>
          <dt className="folio-label text-muted-foreground">Tier</dt>
          <dd className="mt-1 font-medium capitalize">{state.tier}</dd>
        </div>
      </div>
      <div className="border-t border-border pt-3">
        <dt className="folio-label text-muted-foreground">Current quote</dt>
        <dd className="mt-1 font-mono font-semibold tabular-nums">
          {quote ? `${quote.credits.toFixed(1)} credits` : "Pending step 4"}
        </dd>
      </div>
    </dl>
  );
}

export function NewBookWizard({ initialGenre }: { initialGenre?: GenreId } = {}) {
  const [ui, dispatch] = React.useReducer(uiReducer, {
    wizard: initialWizardState,
    resumed: false,
  });
  const state = ui.wizard;
  const [error, setError] = React.useState<string | null>(null);
  const [quoteSummary, setQuoteSummary] = React.useState<WizardQuoteSummary | null>(null);
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
          submitted.current = false;
          setError(result.error);
        }
      } catch {
        window.localStorage.setItem(WIZARD_DRAFT_KEY, serializeDraft(state));
        submitted.current = false;
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
    <div className="instrument-surface-raised overflow-hidden rounded-sm lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="border-b border-border bg-background/35 p-4 lg:border-r lg:border-b-0 lg:p-5">
        <p className="folio-label mb-3 text-muted-foreground">Brief sequence</p>
        <FolioProgress state={state} onGoto={(step) => goToStep({ type: "goto", step })} />
        {ui.resumed ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Resumed your saved draft.
            </p>
            <button
              type="button"
              onClick={handleStartOver}
              className="mt-2 min-h-11 rounded-sm text-xs font-medium text-foreground underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9"
            >
              Start over
            </button>
          </div>
        ) : null}
        <div className="mt-5 hidden border-t border-border pt-4 lg:block">
          <p className="folio-label mb-3 text-muted-foreground">Current setup</p>
          <SetupSummary state={state} quote={quoteSummary} />
        </div>
        <details className="mt-4 border-t border-border pt-3 lg:hidden">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
            Current setup &amp; quote
          </summary>
          <div className="pb-2">
            <SetupSummary state={state} quote={quoteSummary} />
          </div>
        </details>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-border px-5 py-6 sm:px-8">
          <p className="folio-label text-primary">
            Step {String(state.step + 1).padStart(2, "0")} /{" "}
            {String(WIZARD_STEPS.length).padStart(2, "0")}
          </p>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="mt-3 text-xl font-semibold tracking-[-0.02em] text-balance outline-none sm:text-2xl"
          >
            {heading.title}
            <span className="sr-only">{` — step ${state.step + 1} of ${WIZARD_STEPS.length}`}</span>
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {heading.hint}
          </p>
        </header>

        <div className="min-w-0 px-5 py-6 sm:px-8 sm:py-8">
          {stepId === "genre" ? <StepGenre state={state} dispatch={dispatch} /> : null}
          {stepId === "brief" ? <StepBrief state={state} dispatch={dispatch} /> : null}
          {stepId === "shape" ? <StepShape state={state} dispatch={dispatch} /> : null}
          {stepId === "estimate" ? (
            <StepEstimate state={state} dispatch={dispatch} onQuote={setQuoteSummary} />
          ) : null}

          {error ? (
            <p
              role="alert"
              className="mt-5 border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <footer className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-5 py-4 supports-[backdrop-filter]:backdrop-blur-md sm:px-8">
          <Button
            variant="ghost"
            onClick={() => goToStep({ type: "back" })}
            disabled={state.step === 0 || pending}
            className="rounded-sm"
          >
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Back
          </Button>
          {lastStep ? (
            <Button
              onClick={handleSubmit}
              disabled={pending}
              focusableWhenDisabled
              className="rounded-sm aria-disabled:opacity-50"
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
                className="rounded-sm aria-disabled:opacity-50"
              >
                Next
                <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

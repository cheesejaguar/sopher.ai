"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Feather } from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { cn } from "@/lib/utils";
import { startBook } from "@/lib/actions/projects";
import { track } from "@/lib/analytics/track";
import type { GenreId } from "@/ai/knowledge/genres";
import type { StudioAccess } from "@/lib/studio-access";
import type { ProjectExperience } from "@/lib/trial-story";
import {
  FULL_BOOK_UNLOCK_HREF,
  FULL_BOOK_UNLOCK_DESCRIPTION,
  fullBookUnlockHref,
  INCLUDED_STORY_NO_CARD_NOTE,
} from "@/lib/marketing/trial-offer";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StepBrief } from "@/components/wizard/step-brief";
import { StepEstimate, type WizardQuoteSummary } from "@/components/wizard/step-estimate";
import { StepGenre } from "@/components/wizard/step-genre";
import { StepShape } from "@/components/wizard/step-shape";
import {
  composeBrief,
  composeTitle,
  DEFAULT_TIER_KEY,
  applyTrialStoryShape,
  resolvedGenre,
  shapeDefaultsForGenre,
  clearLegacyWizardStorage,
  initialWizardState,
  maxReachableStep,
  restoreDraft,
  serializeDraft,
  stepComplete,
  wizardDraftKey,
  wizardRequestKey,
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
  | WizardActionEvent
  | { type: "resume"; state: WizardState }
  | { type: "start-over"; state: WizardState };

function uiReducer(state: WizardUiState, action: WizardUiEvent): WizardUiState {
  switch (action.type) {
    case "resume":
      return {
        wizard: wizardReducer(state.wizard, { type: "restore", state: action.state }),
        resumed: true,
      };
    case "start-over":
      return { wizard: action.state, resumed: false };
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
  const currentQuote =
    quote?.chapters === state.chapters &&
    quote.wordsPerChapter === state.wordsPerChapter &&
    quote.tier === state.tier
      ? quote
      : null;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
      <div className="col-span-2">
        <dt className="folio-label text-muted-foreground">Working title</dt>
        <dd className="mt-1 line-clamp-2 font-medium">{state.title.trim() || "Not named yet"}</dd>
      </div>
      <div className="col-span-2">
        <dt className="folio-label text-muted-foreground">Shelf</dt>
        <dd className="mt-1 font-medium capitalize">{resolvedGenre(state) ?? "Not chosen"}</dd>
      </div>
      <div className="col-span-2">
        <dt className="folio-label text-muted-foreground">Brief</dt>
        <dd className="mt-1 line-clamp-3 leading-relaxed text-muted-foreground">
          {brief || "Waiting for your story."}
        </dd>
      </div>
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
      <div className="col-span-2">
        <dt className="folio-label text-muted-foreground">Authoring mode</dt>
        <dd className="mt-1 font-medium">
          {state.authoringMode === "guided" ? "Collaborative" : "Autopilot"}
        </dd>
      </div>
      <div className="col-span-2 border-t border-border pt-3">
        <dt className="folio-label text-muted-foreground">Current quote</dt>
        <dd className="mt-1 font-mono font-semibold tabular-nums">
          {currentQuote
            ? (currentQuote.label ?? `${currentQuote.credits.toFixed(1)} credits`)
            : "Pending step 4"}
        </dd>
      </div>
    </dl>
  );
}

type NewBookWizardProps = {
  initialGenre?: GenreId;
  /** Owned trial-story values carried into a new, independent full-book setup. */
  initialSetup?: Partial<WizardState>;
  /** Authenticated owner id; drafts are never stored under a shared browser key. */
  userId?: string;
  access?: StudioAccess;
  /** True only when this route is mounted beneath an active ClerkProvider. */
  accountManagementEnabled?: boolean;
  /**
   * A validated checkout return may restore this account's saved full-book
   * draft directly to final confirmation. Ordinary visits always begin at
   * Step 1, including the explicit Resume flow.
   */
  resumeAfterCheckout?: boolean;
  /**
   * Whether the carried-forward project is the included short story. Any book
   * the author owns can now seed a new setup, so the included-story wording is
   * only correct when the source actually was one.
   */
  carriedFromIncludedStory?: boolean;
  /**
   * Isolated browser-test failure injection. The server page passes this only
   * when the non-production, disposable-DB Workflow stub gate is active.
   */
  e2eStartMode?: "fail_before_work";
};

function ClerkEmailVerificationActions() {
  const { openUserProfile } = useClerk();
  const router = useRouter();

  return (
    <>
      <Button type="button" onClick={() => openUserProfile()} className="rounded-sm">
        Open email settings
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => router.refresh()}
        className="rounded-sm"
      >
        Check verification again
      </Button>
    </>
  );
}

function NewBookAccessGate({
  access,
  accountManagementEnabled,
}: {
  access: StudioAccess;
  accountManagementEnabled: boolean;
}) {
  const existingTrialHref = access.trialProjectId
    ? (`/projects/${access.trialProjectId}/write` as Route)
    : null;
  const verificationRequired = access.reason === "verify_email";

  return (
    <section
      aria-labelledby="new-book-access-title"
      className="instrument-surface-raised rounded-sm px-5 py-8 sm:px-8"
    >
      <h2
        id="new-book-access-title"
        className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl"
      >
        {verificationRequired
          ? "Verify your email to begin"
          : existingTrialHref
            ? "Your included story is already in Studio"
            : "Unlock your next full-length book"}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {verificationRequired
          ? "Your included short story is ready. Verify the email on your account, then return here to start it—no purchase required."
          : existingTrialHref
            ? `Continue that project with every writing, editing, story-bible, manuscript, and export tool. ${INCLUDED_STORY_NO_CARD_NOTE}`
            : `Your included experience has been used. ${FULL_BOOK_UNLOCK_DESCRIPTION}`}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {verificationRequired ? (
          accountManagementEnabled ? (
            <ClerkEmailVerificationActions />
          ) : (
            <div className="space-y-3">
              <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
                This local preview cannot open hosted email settings. Verify the account in the
                configured identity provider, then check this page again.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
                className="rounded-sm"
              >
                Check verification again
              </Button>
            </div>
          )
        ) : existingTrialHref ? (
          <>
            <Link href={existingTrialHref} className={buttonVariants({ className: "rounded-sm" })}>
              Open my included story
            </Link>
            {access.trialProjectCompleted ? (
              <Link
                href={fullBookUnlockHref(access.trialProjectId!)}
                className={buttonVariants({ variant: "outline", className: "rounded-sm" })}
              >
                Take this story to full length
              </Link>
            ) : null}
          </>
        ) : (
          <Link
            href={FULL_BOOK_UNLOCK_HREF}
            className={buttonVariants({ className: "rounded-sm" })}
          >
            View credit packs
          </Link>
        )}
      </div>
    </section>
  );
}

function newRequestKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function initialStateFor(
  experience: ProjectExperience,
  initialGenre?: GenreId,
  initialSetup?: Partial<WizardState>,
): WizardState {
  // A genre arriving via ?genre= never passes through selectGenre, so without
  // this it keeps the adult 12 x 3,000-word shape — which is exactly the path
  // /genres/childrens sends people down.
  const genreShape = initialGenre ? shapeDefaultsForGenre(initialGenre) : null;
  const initial = {
    ...initialWizardState,
    ...(initialGenre ? { genre: initialGenre } : {}),
    ...(genreShape ?? {}),
    // A carried-forward setup is the author's own prior book; it outranks a
    // genre default.
    ...initialSetup,
    step: 0,
  };
  return experience === "trial_short_story" ? applyTrialStoryShape(initial) : initial;
}

type ClientStartResult =
  | { status: "accepted" | "reattached"; projectId: string; runId: string }
  | { status: "start_failed"; projectId: string; runId?: string; message: string }
  | {
      status: "validation_error" | "insufficient_credits" | "rate_limited" | "suspended";
      message: string;
    };

function parseStartResult(value: unknown): ClientStartResult | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  const status = result.status;
  if (
    (status === "accepted" || status === "reattached") &&
    typeof result.projectId === "string" &&
    typeof result.runId === "string"
  ) {
    return { status, projectId: result.projectId, runId: result.runId };
  }
  if (
    status === "start_failed" &&
    typeof result.projectId === "string" &&
    typeof result.message === "string"
  ) {
    return {
      status,
      projectId: result.projectId,
      ...(typeof result.runId === "string" ? { runId: result.runId } : {}),
      message: result.message,
    };
  }
  if (
    (status === "validation_error" ||
      status === "insufficient_credits" ||
      status === "rate_limited" ||
      status === "suspended") &&
    typeof result.message === "string"
  ) {
    return { status, message: result.message };
  }
  // Transitional compatibility while every caller moves to StartBookResult.
  return typeof result.error === "string"
    ? { status: "validation_error", message: result.error }
    : null;
}

export function NewBookWizard(props: NewBookWizardProps = {}) {
  const { access, accountManagementEnabled = false, ...setupProps } = props;
  if (access?.creationExperience === null) {
    return (
      <NewBookAccessGate access={access} accountManagementEnabled={accountManagementEnabled} />
    );
  }
  return (
    <NewBookSetupWizard {...setupProps} experience={access?.creationExperience ?? "full_book"} />
  );
}

function NewBookSetupWizard({
  initialGenre,
  initialSetup,
  userId,
  experience,
  e2eStartMode,
  resumeAfterCheckout = false,
  carriedFromIncludedStory: carriedFromIncludedStoryProp = false,
}: Omit<NewBookWizardProps, "access"> & { experience: ProjectExperience }) {
  const router = useRouter();
  const freshState = React.useMemo(
    () => initialStateFor(experience, initialGenre, initialSetup),
    [experience, initialGenre, initialSetup],
  );
  const carriedForward = experience === "full_book" && Boolean(initialSetup);
  const carriedFromIncludedStory = carriedForward && carriedFromIncludedStoryProp;
  const [ui, dispatch] = React.useReducer(uiReducer, {
    wizard: freshState,
    resumed: false,
  });
  const state = ui.wizard;
  const [error, setError] = React.useState<string | null>(null);
  const [quoteSummary, setQuoteSummary] = React.useState<WizardQuoteSummary | null>(null);
  const [availableDraft, setAvailableDraft] = React.useState<WizardState | null>(null);
  const [draftChecked, setDraftChecked] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const hydrated = React.useRef(false);
  const persistenceEnabled = React.useRef(false);
  const requestKeyRef = React.useRef<string | null>(null);
  // Set only by the step controls, so the heading is never focused on mount
  // or when a saved draft is restored.
  const stepChanged = React.useRef(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  function goToStep(action: WizardActionEvent) {
    setError(null);
    stepChanged.current = true;
    dispatch(action);
  }

  const updateWizard = React.useCallback((action: WizardActionEvent) => {
    setError(null);
    dispatch(action);
  }, []);

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
        // Free-text genres are deliberately reported as one bucket: an
        // analytics dimension must stay a closed set, and the author's own
        // words are their content, not a label.
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

  // Discover a saved draft once, but never move the author into it without an
  // explicit choice. Draft keys are scoped to the authenticated account.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      // v1 originally used one browser-global key. Never surface that draft
      // across accounts; scoped keys below are the only supported storage.
      clearLegacyWizardStorage(window.localStorage, userId);
      const key = userId ? wizardDraftKey(userId, experience) : null;
      const draft = key ? restoreDraft(window.localStorage.getItem(key), experience) : null;
      if (draft && draftHasContent(draft)) {
        const normalized = experience === "trial_short_story" ? applyTrialStoryShape(draft) : draft;
        if (
          resumeAfterCheckout &&
          experience === "full_book" &&
          maxReachableStep(normalized) === WIZARD_STEPS.length - 1
        ) {
          persistenceEnabled.current = Boolean(key);
          dispatch({
            type: "resume",
            state: { ...normalized, step: WIZARD_STEPS.length - 1 },
          });
        } else {
          setAvailableDraft(normalized);
          persistenceEnabled.current = false;
        }
      } else {
        const tier = window.localStorage.getItem(DEFAULT_TIER_KEY);
        if (
          experience === "full_book" &&
          (tier === "draft" || tier === "standard" || tier === "premium")
        ) {
          dispatch({ type: "patch", patch: { tier } });
        }
        persistenceEnabled.current = Boolean(key);
      }
      hydrated.current = true;
      setDraftChecked(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [experience, resumeAfterCheckout, userId]);

  // Persist the draft, debounced, so a closed tab costs nothing.
  React.useEffect(() => {
    if (!hydrated.current || !persistenceEnabled.current || !userId) return;
    const timer = setTimeout(() => {
      if (persistenceEnabled.current) {
        window.localStorage.setItem(
          wizardDraftKey(userId, experience),
          serializeDraft(state, experience),
        );
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [experience, state, userId]);

  function handleResume() {
    if (!availableDraft) return;
    setError(null);
    persistenceEnabled.current = Boolean(userId);
    dispatch({
      type: "resume",
      state:
        experience === "trial_short_story"
          ? applyTrialStoryShape(availableDraft)
          : { ...availableDraft, step: 0 },
    });
    setAvailableDraft(null);
  }

  function handleStartFresh() {
    setError(null);
    if (userId) {
      window.localStorage.removeItem(wizardDraftKey(userId, experience));
      window.localStorage.removeItem(wizardRequestKey(userId, experience));
    }
    requestKeyRef.current = null;
    persistenceEnabled.current = Boolean(userId);
    setAvailableDraft(null);
    dispatch({ type: "start-over", state: freshState });
  }

  function handleStartOver() {
    handleStartFresh();
  }

  function handleSubmit() {
    const submittedGenre = resolvedGenre(state);
    if (!submittedGenre || !stepComplete(state, 1)) return;
    if (
      quoteSummary?.chapters !== state.chapters ||
      quoteSummary.wordsPerChapter !== state.wordsPerChapter ||
      quoteSummary.tier !== state.tier
    ) {
      return;
    }
    const genre = submittedGenre;
    setError(null);
    let requestKey = requestKeyRef.current;
    if (!requestKey && userId) {
      requestKey = window.localStorage.getItem(wizardRequestKey(userId, experience));
    }
    requestKey ??= newRequestKey();
    requestKeyRef.current = requestKey;
    if (userId) {
      window.localStorage.setItem(wizardRequestKey(userId, experience), requestKey);
    }

    const payload = {
      requestKey,
      ...(e2eStartMode ? { e2eStartMode } : {}),
      title: composeTitle(state),
      brief: composeBrief(state),
      genre: submittedGenre,
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
        authoringMode: state.authoringMode,
        qualityTier: state.tier,
        requireOutlineApproval: state.requireOutlineApproval,
        ...(state.voiceProfile !== "none" ? { voiceProfile: state.voiceProfile } : {}),
      },
    };
    startTransition(async () => {
      try {
        const result = parseStartResult((await startBook(payload)) as unknown);
        if (result?.status === "accepted" || result?.status === "reattached") {
          submitted.current = true;
          persistenceEnabled.current = false;
          track("book_started", {
            genre,
            tier: state.tier,
            chapters: state.chapters,
            wordsPerChapter: state.wordsPerChapter,
            outlineApproval: state.requireOutlineApproval,
            authoringMode: state.authoringMode,
            experience,
            reattached: result.status === "reattached",
          });
          if (userId) {
            window.localStorage.removeItem(wizardDraftKey(userId, experience));
            window.localStorage.removeItem(wizardRequestKey(userId, experience));
          }
          router.replace(`/projects/${result.projectId}/write`);
          return;
        }
        if (result?.status === "start_failed") {
          // The project exists, so its Write surface owns the recovery. Keep
          // the draft and idempotency key until a run is actually accepted.
          submitted.current = false;
          router.replace(`/projects/${result.projectId}/write`);
          return;
        }
        submitted.current = false;
        if (result && "message" in result) {
          setError(result.message);
          return;
        }
        setError("The Studio returned an unexpected response. Your setup is saved; try again.");
      } catch {
        submitted.current = false;
        setError(
          "The Studio could not be reached. Your setup is saved; check your connection and try again.",
        );
      }
    });
  }

  const stepId = WIZARD_STEPS[state.step].id;
  const heading =
    experience === "trial_short_story" && stepId === "shape"
      ? {
          title: "Shape your short story",
          hint: "The included length is fixed; voice, perspective, and content limits remain yours.",
        }
      : experience === "trial_short_story" && stepId === "estimate"
        ? {
            title: "Review your included production",
            hint: "One complete short story, with outline approval and the full Studio toolset.",
          }
        : STEP_HEADINGS[stepId];
  const lastStep = state.step === WIZARD_STEPS.length - 1;
  const canAdvance = stepComplete(state, state.step);
  const quoteReady =
    quoteSummary?.chapters === state.chapters &&
    quoteSummary.wordsPerChapter === state.wordsPerChapter &&
    quoteSummary.tier === state.tier;
  const needsCredits = experience === "full_book" && quoteReady && quoteSummary?.covered === false;
  const checkoutResumeHref = "/studio/credits?return=%2Fstudio%2Fnew%3Fresume%3Dcheckout" as const;

  function preserveSetupForCheckout() {
    if (!userId) return;
    persistenceEnabled.current = true;
    window.localStorage.setItem(
      wizardDraftKey(userId, experience),
      serializeDraft(state, experience),
    );
  }
  // Why "Next" is unavailable — the button alone does not make this obvious.
  const blockedReason =
    stepId === "genre"
      ? "Choose a genre to continue."
      : !state.title.trim()
        ? "Add a working title to continue."
        : "Describe the story in a few sentences to continue.";

  if (!draftChecked) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading your book setup"
        className="instrument-surface-raised min-h-72 rounded-sm"
      />
    );
  }

  if (availableDraft) {
    return (
      <section
        aria-labelledby="saved-setup-title"
        className="instrument-surface-raised grid overflow-hidden rounded-sm lg:grid-cols-[14rem_minmax(0,1fr)]"
      >
        <div className="border-b border-border bg-background/35 p-5 lg:border-r lg:border-b-0">
          <p className="folio-label text-primary">Saved setup</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Your answers are kept separate for this account on this device.
          </p>
        </div>
        <div className="px-5 py-8 sm:px-8 sm:py-10">
          <h2
            id="saved-setup-title"
            className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl"
          >
            Continue where you left off?
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Resume{" "}
            <span className="font-medium text-foreground">
              {availableDraft.title.trim() || "your saved story"}
            </span>{" "}
            with its answers restored, or{" "}
            {carriedFromIncludedStory
              ? "use the included story carried into this full-length setup"
              : carriedForward
                ? "use the setup carried over from your other book"
                : "begin with a clean setup"}
            . Either choice opens on Step 1.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={handleResume} className="rounded-sm">
              Resume saved setup
            </Button>
            <Button variant="outline" onClick={handleStartFresh} className="rounded-sm">
              {carriedFromIncludedStory
                ? "Use included story"
                : carriedForward
                  ? "Use carried setup"
                  : "Start fresh"}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="instrument-surface-raised overflow-hidden rounded-sm lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside
        aria-label="Book setup progress and summary"
        className="border-b border-border bg-background/35 p-4 lg:border-r lg:border-b-0 lg:p-5"
      >
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
        {carriedForward ? (
          <div className="border-b border-ai/30 bg-ai-soft px-5 py-3 text-sm sm:px-8">
            <p className="font-medium text-ai">
              {carriedFromIncludedStory
                ? "Your included story is carried forward."
                : "Your earlier book's setup is carried forward."}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {carriedFromIncludedStory
                ? "Its title, genre, and brief are ready to review. This creates a separate full-length production, so the completed short story remains unchanged."
                : "Its title, genre, brief, and writing settings are ready to review. This creates a separate production, so the book you started from remains unchanged."}
            </p>
          </div>
        ) : null}
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
          {stepId === "genre" ? (
            <StepGenre state={state} dispatch={updateWizard} experience={experience} />
          ) : null}
          {stepId === "brief" ? <StepBrief state={state} dispatch={updateWizard} /> : null}
          {stepId === "shape" ? (
            <StepShape state={state} dispatch={updateWizard} experience={experience} />
          ) : null}
          {stepId === "estimate" ? (
            <StepEstimate
              state={state}
              dispatch={updateWizard}
              onQuote={setQuoteSummary}
              experience={experience}
            />
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
            <>
              <p id="wizard-quote-hint" className="sr-only" aria-live="polite">
                {!quoteReady
                  ? "Wait for the current production estimate before starting."
                  : needsCredits
                    ? "Add enough credits before production can start."
                    : ""}
              </p>
              {needsCredits ? (
                <Button
                  nativeButton={false}
                  render={<Link href={checkoutResumeHref} />}
                  onClick={preserveSetupForCheckout}
                  aria-describedby="wizard-quote-hint"
                  className="rounded-sm"
                >
                  Add credits to start
                  <ArrowRight aria-hidden="true" data-icon="inline-end" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={pending || !quoteReady}
                  focusableWhenDisabled
                  aria-describedby={quoteReady ? undefined : "wizard-quote-hint"}
                  className="rounded-sm aria-disabled:opacity-50"
                >
                  {pending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Feather aria-hidden="true" data-icon="inline-start" />
                  )}
                  {pending
                    ? "Starting the story…"
                    : experience === "trial_short_story"
                      ? "Create my short story"
                      : "Start the book"}
                </Button>
              )}
            </>
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

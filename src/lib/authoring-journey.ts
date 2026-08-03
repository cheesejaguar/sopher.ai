import type { ProjectExperience } from "@/db/schema";
import {
  isActiveProductionProgress,
  lifecyclePhaseForProduction,
  type LifecyclePhase,
  type ProductionStage,
  type ProjectProgressSnapshot,
} from "@/lib/project-progress";
import type { AuthoringRunStatus } from "@/lib/generation-runs";
import type { WorkflowHealthStatus } from "@/lib/run-health";
import { fullBookRequiredCredits } from "@/lib/full-book-credit-requirement";
import { fullBookSetupHref, fullBookUnlockHref } from "@/lib/marketing/trial-offer";

export type AuthoringNextActionKind =
  | "complete_setup"
  | "start_production"
  | "recover_dispatch"
  | "watch_production"
  | "answer_question"
  | "review_outline"
  | "add_credits"
  | "finish_cancellation"
  | "recover_saved_work"
  | "edit_manuscript"
  | "read_or_export"
  | "contact_support"
  | "unlock_full_book";

export type AuthoringJourneyHealth =
  "healthy" | "waiting" | "degraded" | "needs_attention" | "complete";

export type AuthoringNextAction = {
  kind: AuthoringNextActionKind;
  href: string;
  label: string;
  description: string;
  requiresMeteredAccess: boolean;
};

export type AuthoringJourneyArtifacts = {
  briefReady: boolean;
  bookReady: boolean;
  /** Independent, run-owned proof that a full-book finalization committed. */
  fullBookCompletionReady: boolean;
  outlineReady: boolean;
  savedChapters: number;
  savedCheckpoints: number;
  editedChapters: number;
  finalChapters: number;
  totalChapters: number;
  wordCount: number;
};

export type AuthoringJourneyRun = {
  id: string;
  kind?: "full_book" | "chapter" | "edit_pass" | "continuity";
  databaseStatus: AuthoringRunStatus;
  workflowStatus: WorkflowHealthStatus | null;
  effectiveStatus: AuthoringRunStatus;
  stage: ProductionStage;
  progressPct: number;
  stageDescription: string | null;
  acceptedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastUpdateAt: string;
  acceptanceUncertain: boolean;
  safeToRetry: boolean;
  authoringBegan: boolean;
  noWorkStarted: boolean;
  completionArtifactsReady?: boolean;
  heartbeatAt?: string | null;
  lastProgressAt?: string | null;
  workflowObservedAt?: string | null;
  dispatchAttempts?: number;
  rootErrorCode?: string | null;
  rootErrorStage?: string | null;
  /**
   * Unresolved operational evidence that makes an automated restart unsafe.
   * These identifiers are content-free and come from the run incident ledger.
   */
  blockingIncidentCategories?: string[];
  supportReference?: string | null;
  cancellationRequestedAt?: string | null;
  pause?: {
    kind: "outline_approval" | "credits" | "creative_decision" | "unknown";
    version?: number;
    balanceCredits?: number;
    requiredCredits?: number;
    resumeStage?: string;
  } | null;
  health: AuthoringJourneyHealth;
  spend: {
    meteredUsd: number;
    creditsUsed: number;
    scope: "run" | "project";
  };
};

export type AuthoringJourneySnapshot = {
  project: {
    id: string;
    title: string;
    genre: string | null;
    status: "draft" | "generating" | "editing" | "complete" | "archived";
    experience: ProjectExperience;
    updatedAt: string;
    targetChapters: number;
    targetWordsPerChapter: number;
    qualityTier: "draft" | "standard" | "premium";
  };
  phase: Lowercase<LifecyclePhase>;
  artifacts: AuthoringJourneyArtifacts;
  access: {
    fullBookUnlocked: boolean;
    suspended: boolean;
    balanceCredits: number | null;
  };
  spend: {
    meteredUsd: number;
    creditsUsed: number;
  };
  run: AuthoringJourneyRun | null;
  health: AuthoringJourneyHealth;
  nextAction: AuthoringNextAction;
  purchaseAction: AuthoringNextAction | null;
  supportReference: string;
};

export type AuthoringJourneySeed = {
  project: AuthoringJourneySnapshot["project"] & {
    brief: string | null;
    completedAt: string | null;
  };
  artifacts: Omit<AuthoringJourneyArtifacts, "briefReady" | "fullBookCompletionReady"> & {
    briefReady?: boolean;
    fullBookCompletionReady?: boolean;
  };
  access: AuthoringJourneySnapshot["access"];
  spend?: AuthoringJourneySnapshot["spend"];
  run: AuthoringJourneyRun | null;
};

type NormalizedAuthoringJourneySeed = Omit<AuthoringJourneySeed, "artifacts"> & {
  artifacts: AuthoringJourneyArtifacts;
};

const ACTIVE_RUN_STATUSES = new Set<AuthoringRunStatus>(["queued", "running", "awaiting_input"]);

const RECOVERY_STATUSES = new Set<AuthoringRunStatus>(["failed", "cancelled"]);

const ACTION_STATUS_LABELS: Record<AuthoringNextActionKind, string> = {
  complete_setup: "Setup",
  start_production: "Ready",
  recover_dispatch: "Reconnect",
  watch_production: "Writing",
  answer_question: "Your choice",
  review_outline: "Review needed",
  add_credits: "Credits needed",
  finish_cancellation: "Stopping",
  recover_saved_work: "Recovery ready",
  edit_manuscript: "Ready to edit",
  read_or_export: "Complete",
  contact_support: "Needs attention",
  unlock_full_book: "Full length",
};

function projectHref(projectId: string, stage: string): string {
  return `/projects/${projectId}/${stage}`;
}

function supportReferenceFor(projectId: string, runId?: string | null): string {
  const projectPart = projectId.replaceAll("-", "").slice(0, 8).toUpperCase();
  const runPart = runId ? runId.replaceAll("-", "").slice(0, 8).toUpperCase() : "PROJECT";
  return `SPH-${projectPart}-${runPart}`;
}

function supportHref(reference: string): string {
  const subject = encodeURIComponent(`Authoring help · ${reference}`);
  const body = encodeURIComponent(
    `I need help with an authoring run.\n\nSupport reference: ${reference}\n\nWhat I was doing:\n`,
  );
  return `mailto:support@sopher.ai?subject=${subject}&body=${body}`;
}

function nextAction(
  kind: AuthoringNextActionKind,
  href: string,
  label: string,
  description: string,
  requiresMeteredAccess = false,
): AuthoringNextAction {
  return { kind, href, label, description, requiresMeteredAccess };
}

function fullBookContinuationAction(
  projectId: string,
  fullBookUnlocked: boolean,
): AuthoringNextAction {
  return nextAction(
    "unlock_full_book",
    fullBookUnlocked ? fullBookSetupHref(projectId) : fullBookUnlockHref(projectId),
    "Continue this story at full length",
    fullBookUnlocked
      ? "Your full-length controls are unlocked. Keep the title, genre, and brief, then choose the new book’s length and quality."
      : "Keep the title, genre, and brief through checkout, then choose the length and production quality for a full book.",
  );
}

function readAction(projectId: string): AuthoringNextAction {
  return nextAction(
    "read_or_export",
    `${projectHref(projectId, "manuscript")}#manuscript-actions`,
    "Read or export the manuscript",
    "Your assembled manuscript is ready to read, download, or take back into the editor.",
  );
}

function editAction(projectId: string, savedChapters: number): AuthoringNextAction {
  return nextAction(
    "edit_manuscript",
    projectHref(projectId, "editor"),
    "Continue editing",
    savedChapters === 1
      ? "One saved chapter is ready in the editor."
      : `${savedChapters} saved chapters are ready in the editor.`,
  );
}

function supportAction(reference: string, description: string): AuthoringNextAction {
  return nextAction("contact_support", supportHref(reference), "Contact support", description);
}

const EVIDENCE_UNSAFE_ERROR_CODES = new Set([
  "completion_contradiction",
  "event_persistence",
  "invalid_pause",
  "metered_output_missing",
]);

const EVIDENCE_UNSAFE_INCIDENT_CATEGORIES = new Set([
  "completion_contradiction",
  "event_persistence",
  "invalid_pause",
  "unresolved_metering",
]);

function hasEvidenceUnsafeRecoveryState(run: AuthoringJourneyRun): boolean {
  const errorCode = run.rootErrorCode?.trim().toLowerCase() ?? "";
  return (
    EVIDENCE_UNSAFE_ERROR_CODES.has(errorCode) ||
    (run.blockingIncidentCategories ?? []).some((category) =>
      EVIDENCE_UNSAFE_INCIDENT_CATEGORIES.has(category),
    )
  );
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(value);
}

function phaseFor(input: {
  action: AuthoringNextAction;
  run: AuthoringJourneyRun | null;
}): AuthoringJourneySnapshot["phase"] {
  if (input.run && ACTIVE_RUN_STATUSES.has(input.run.effectiveStatus)) {
    return lifecyclePhaseForProduction(input.run.stage).toLowerCase() as Lowercase<LifecyclePhase>;
  }
  switch (input.action.kind) {
    case "complete_setup":
    case "start_production":
    case "recover_dispatch":
    case "answer_question":
    case "review_outline":
      return "plan";
    case "watch_production":
    case "add_credits":
    case "finish_cancellation":
    case "recover_saved_work":
    case "contact_support":
      return "produce";
    case "edit_manuscript":
      return "refine";
    case "read_or_export":
    case "unlock_full_book":
      return "publish";
  }
}

function actionForSeed(
  input: NormalizedAuthoringJourneySeed,
  reference: string,
): AuthoringNextAction {
  const { project, artifacts, access, run } = input;
  const projectWriteHref =
    run?.kind && run.kind !== "full_book"
      ? projectHref(project.id, "editor")
      : projectHref(project.id, "write");

  if (project.status === "archived") {
    return artifacts.savedChapters > 0
      ? readAction(project.id)
      : nextAction(
          "complete_setup",
          projectHref(project.id, "brief"),
          "View the project brief",
          "This archived project has no saved manuscript yet.",
        );
  }

  if (run?.cancellationRequestedAt && ACTIVE_RUN_STATUSES.has(run.effectiveStatus)) {
    return nextAction(
      "finish_cancellation",
      projectWriteHref,
      "View the safe stop",
      "The studio is stopping before another model call or manuscript commit begins.",
    );
  }

  if (run && hasEvidenceUnsafeRecoveryState(run)) {
    return supportAction(
      reference,
      "This run has contradictory or unresolved operational evidence, so the Studio will not restart it automatically. Support can recheck the durable run, billing, and saved artifacts without risking duplicate work.",
    );
  }

  if (run && ACTIVE_RUN_STATUSES.has(run.effectiveStatus)) {
    if (run.stage === "awaiting_credits" || run.pause?.kind === "credits") {
      if (project.experience === "trial_short_story" && !access.fullBookUnlocked) {
        return supportAction(
          reference,
          "Your included story should not require a purchase to finish. Share this reference so we can restore the included production.",
        );
      }
      return nextAction(
        "add_credits",
        `/studio/credits?return=${encodeURIComponent(projectWriteHref)}&resumeRun=${encodeURIComponent(run.id)}`,
        "Add credits to continue",
        typeof run.pause?.requiredCredits === "number"
          ? `Production needs ${formatCredits(run.pause.requiredCredits)} credits${
              typeof run.pause.balanceCredits === "number"
                ? ` and the current balance is ${formatCredits(run.pause.balanceCredits)}`
                : ""
            }. ${artifacts.savedChapters} of ${artifacts.totalChapters} ${
              artifacts.savedChapters === 1 ? "chapter is" : "chapters are"
            } saved.`
          : `${artifacts.savedChapters} of ${artifacts.totalChapters} ${
              artifacts.savedChapters === 1 ? "chapter is" : "chapters are"
            } saved. Production resumes from that work after checkout.`,
        true,
      );
    }

    if (run.stage === "awaiting_guidance" || run.pause?.kind === "creative_decision") {
      return nextAction(
        "answer_question",
        `${projectWriteHref}#creative-decision`,
        "Choose your story direction",
        "Sopher developed the premise and needs one creative choice from you before building the chapter plan.",
      );
    }

    if (
      run.stage === "awaiting_approval" ||
      run.pause?.kind === "outline_approval" ||
      (run.effectiveStatus === "awaiting_input" && artifacts.outlineReady)
    ) {
      return nextAction(
        "review_outline",
        projectHref(project.id, "outline"),
        "Review the outline",
        "Production is paused until you approve the story plan or send revision notes.",
      );
    }

    if (run.effectiveStatus === "awaiting_input") {
      return supportAction(
        reference,
        "Production is waiting for input, but the saved request does not identify a safe response. Your work remains preserved.",
      );
    }

    if (run.acceptanceUncertain && run.safeToRetry) {
      return nextAction(
        "recover_dispatch",
        projectWriteHref,
        run.kind === "edit_pass" ? "Reconnect this review" : "Reconnect this start",
        run.kind === "edit_pass"
          ? "The manuscript direction is saved, but the studio did not receive a start confirmation. Reconnect the same review without creating another."
          : "The book request is saved, but the studio did not receive a start confirmation. Reconnect the same run without creating another.",
        true,
      );
    }

    if (run.health === "needs_attention") {
      return supportAction(
        reference,
        "Production has not reported progress within its expected window. Your saved work is preserved.",
      );
    }

    if (run.kind === "edit_pass") {
      return nextAction(
        "watch_production",
        projectWriteHref,
        run.stage === "queued" ? "Watch the manuscript review" : "Follow the manuscript review",
        run.health === "degraded"
          ? "The live status is delayed. The durable review remains active, and the Editor will keep checking it."
          : "Follow the chapter-by-chapter review, real progress, and credit use in the Editor.",
      );
    }

    return nextAction(
      "watch_production",
      run.kind && run.kind !== "full_book"
        ? projectWriteHref
        : `${projectWriteHref}#production-status`,
      run.stage === "queued" ? "Watch the writing room" : "Watch production",
      run.health === "degraded"
        ? "The live connection is delayed. The durable run remains active, and the Write page will keep checking it."
        : "Follow the current stage, saved chapters, elapsed time, and credit use in the Write room.",
    );
  }

  // A database-only library snapshot intentionally normalizes a reported
  // completion without the required manuscript proof to `failed`. Preserve
  // the stronger completion contradiction before the generic failed-run
  // recovery path: restarting from ambiguous completion evidence could repeat
  // settled work or debit the author twice.
  const isWholeBookRun = !run?.kind || run.kind === "full_book";
  const completionReported =
    isWholeBookRun &&
    (run?.effectiveStatus === "completed" || run?.stage === "done" || project.completedAt !== null);
  // `fullBookCompletionReady` is durable, run-owned proof. The live chapter
  // projection is intentionally excluded here because authors can add,
  // remove, or reopen chapters after a valid production completion.
  const finalArtifactsReady = artifacts.fullBookCompletionReady;
  if (completionReported && !finalArtifactsReady) {
    return supportAction(
      reference,
      "Production reported completion without a complete, verifiable manuscript. Your saved chapters remain preserved while we investigate.",
    );
  }

  if (completionReported && finalArtifactsReady) return readAction(project.id);

  if (run && RECOVERY_STATUSES.has(run.effectiveStatus)) {
    if (run.kind === "edit_pass") {
      return nextAction(
        "edit_manuscript",
        projectWriteHref,
        "Review saved suggestions",
        "The manuscript review stopped without overwriting your prose. Suggestions from completed chapters remain ready, and you can deliberately start another pass from the Editor.",
      );
    }
    if (project.experience === "full_book" && !access.fullBookUnlocked) {
      return artifacts.savedChapters > 0
        ? editAction(project.id, artifacts.savedChapters)
        : supportAction(
            reference,
            "Writing did not finish, and no manuscript was saved. A purchase is not required to investigate this failed run.",
          );
    }
    return nextAction(
      "recover_saved_work",
      `${projectWriteHref}#authoring-recovery`,
      artifacts.savedChapters > 0 ? "Resume from saved work" : "Try starting again",
      artifacts.savedChapters > 0
        ? `${artifacts.savedChapters} saved ${
            artifacts.savedChapters === 1 ? "chapter is" : "chapters are"
          } ready to reuse. Review the recovery details before you restart.`
        : run.noWorkStarted
          ? "Writing did not begin and no credits were used. Review the failure, then retry deliberately."
          : "Review what happened and deliberately start a recovery run.",
      true,
    );
  }

  // Scoped editor workflows prove only their bounded mutation. They must not
  // be mistaken for whole-book finalization merely because their own Workflow
  // completed successfully.
  const scopedMutationCompleted =
    run?.kind !== undefined &&
    run.kind !== "full_book" &&
    (run.effectiveStatus === "completed" || run.stage === "done");
  if (
    scopedMutationCompleted &&
    artifacts.totalChapters > 0 &&
    artifacts.finalChapters >= artifacts.totalChapters
  ) {
    return readAction(project.id);
  }

  if (artifacts.savedChapters > 0) return editAction(project.id, artifacts.savedChapters);

  if (!artifacts.briefReady) {
    return nextAction(
      "complete_setup",
      projectHref(project.id, "brief"),
      "Finish the brief",
      "Add the missing story details so the studio has a clear source of truth.",
    );
  }

  if (access.suspended) {
    return supportAction(
      reference,
      "This account cannot start metered authoring right now. Your brief remains saved.",
    );
  }

  if (project.experience === "full_book" && !access.fullBookUnlocked) {
    return nextAction(
      "unlock_full_book",
      `/studio/credits?return=${encodeURIComponent(projectWriteHref)}`,
      "Unlock full-length production",
      "Your brief is ready. One credit purchase unlocks the full-book production controls.",
    );
  }

  if (project.experience === "full_book" && access.balanceCredits !== null) {
    const requiredCredits = fullBookRequiredCredits({
      tier: project.qualityTier,
      targetChapters: project.targetChapters,
      targetWordsPerChapter: project.targetWordsPerChapter,
    });
    if (access.balanceCredits < requiredCredits) {
      const needed = requiredCredits - access.balanceCredits;
      return nextAction(
        "add_credits",
        `/studio/credits?return=${encodeURIComponent(projectWriteHref)}&needed=${encodeURIComponent(String(needed))}`,
        "Add credits to start",
        `Your setup is saved. Production needs ${formatCredits(requiredCredits)} credits and the current balance is ${formatCredits(access.balanceCredits)}. Checkout returns to the same confirmation.`,
        true,
      );
    }
  }

  return nextAction(
    "start_production",
    projectWriteHref,
    "Review production and start",
    "Your brief is ready. Review the chapter plan, quality, approval stop, timing, and cost before anything runs.",
    true,
  );
}

export function deriveAuthoringJourney(input: AuthoringJourneySeed): AuthoringJourneySnapshot {
  const briefReady =
    input.project.title.trim().length > 0 && (input.project.brief?.trim().length ?? 0) > 0;
  const latestRunCanProveFullBookCompletion = !input.run?.kind || input.run.kind === "full_book";
  const seed: NormalizedAuthoringJourneySeed = {
    ...input,
    artifacts: {
      ...input.artifacts,
      briefReady,
      fullBookCompletionReady:
        input.artifacts.fullBookCompletionReady ??
        (latestRunCanProveFullBookCompletion && input.run?.completionArtifactsReady === true),
    },
  };
  const supportReference =
    seed.run?.supportReference ?? supportReferenceFor(seed.project.id, seed.run?.id);
  const proposedAction = actionForSeed(seed, supportReference);
  const action =
    seed.access.suspended && proposedAction.requiresMeteredAccess
      ? supportAction(
          supportReference,
          "This account cannot resume metered authoring right now. Every saved chapter remains available to read or edit.",
        )
      : proposedAction;
  const completedTrial =
    seed.project.experience === "trial_short_story" && seed.artifacts.fullBookCompletionReady;

  return {
    project: {
      id: seed.project.id,
      title: seed.project.title,
      genre: seed.project.genre,
      status: seed.project.status,
      experience: seed.project.experience,
      updatedAt: seed.project.updatedAt,
      targetChapters: seed.project.targetChapters,
      targetWordsPerChapter: seed.project.targetWordsPerChapter,
      qualityTier: seed.project.qualityTier,
    },
    phase: phaseFor({ action, run: seed.run }),
    artifacts: seed.artifacts,
    access: seed.access,
    spend: seed.spend ?? {
      meteredUsd: seed.run?.spend.meteredUsd ?? 0,
      creditsUsed: seed.run?.spend.creditsUsed ?? 0,
    },
    run: seed.run,
    health: seed.run?.health ?? (action.kind === "read_or_export" ? "complete" : "healthy"),
    nextAction: action,
    purchaseAction: completedTrial
      ? fullBookContinuationAction(seed.project.id, seed.access.fullBookUnlocked)
      : null,
    supportReference,
  };
}

export function journeyStatusLabel(action: AuthoringNextAction): string {
  return ACTION_STATUS_LABELS[action.kind];
}

/**
 * The server snapshot owns routing. Live project progress may only advance the
 * active run portion so the lifecycle rail and next-step callout do not lag
 * behind a stream event while the rest of the server facts remain unchanged.
 */
export function authoringJourneyWithProgress(
  snapshot: AuthoringJourneySnapshot,
  progress: ProjectProgressSnapshot,
): AuthoringJourneySnapshot {
  if (!progress.runId) return snapshot;

  const existingRun = snapshot.run;
  const sameRun = existingRun?.id === progress.runId;
  const existingRunIsActive =
    existingRun !== null && ACTIVE_RUN_STATUSES.has(existingRun.effectiveStatus);
  const activeReplacement =
    !sameRun && isActiveProductionProgress(progress) && !existingRunIsActive;

  // Project progress can briefly move ahead of the server snapshot after a
  // deliberate recovery start. Only an active, distinct run may replace a
  // terminal (or absent) snapshot. A second run must never displace another
  // active run, and stale progress from a terminal run must never revive it.
  if (!sameRun && !activeReplacement) return snapshot;
  if (sameRun && existingRun && !existingRunIsActive) return snapshot;

  // A streamed `done` event is an immediate presentation signal, not durable
  // proof that finalization committed every chapter and completion digest.
  // Keep the authoritative next action and artifact counts until the server
  // snapshot confirms completion; the lifecycle UI can still display 100%.
  if (progress.stage === "done") {
    return {
      ...snapshot,
      run: snapshot.run
        ? {
            ...snapshot.run,
            stage: "done",
            progressPct: progress.pct,
            stageDescription: progress.detail ?? null,
          }
        : null,
    };
  }

  const terminalStatus: AuthoringRunStatus | null =
    progress.stage === "failed" ? "failed" : progress.stage === "cancelled" ? "cancelled" : null;
  const inheritedRun = activeReplacement ? null : existingRun;
  const activeStatus: AuthoringRunStatus =
    progress.stage === "queued"
      ? "queued"
      : progress.stage === "awaiting_guidance" ||
          progress.stage === "awaiting_approval" ||
          progress.stage === "awaiting_credits"
        ? "awaiting_input"
        : "running";
  const run: AuthoringJourneyRun = {
    id: progress.runId,
    kind: activeReplacement ? "full_book" : inheritedRun?.kind,
    databaseStatus: terminalStatus ?? inheritedRun?.databaseStatus ?? activeStatus,
    workflowStatus: inheritedRun?.workflowStatus ?? null,
    effectiveStatus: terminalStatus ?? inheritedRun?.effectiveStatus ?? activeStatus,
    stage: progress.stage,
    progressPct: progress.pct,
    stageDescription: progress.detail ?? null,
    acceptedAt: inheritedRun?.acceptedAt ?? snapshot.project.updatedAt,
    startedAt: inheritedRun?.startedAt ?? null,
    completedAt: inheritedRun?.completedAt ?? null,
    lastUpdateAt: inheritedRun?.lastUpdateAt ?? snapshot.project.updatedAt,
    acceptanceUncertain: inheritedRun?.acceptanceUncertain ?? false,
    safeToRetry: inheritedRun?.safeToRetry ?? false,
    authoringBegan: inheritedRun?.authoringBegan ?? progress.stage !== "queued",
    noWorkStarted:
      inheritedRun?.noWorkStarted ?? (progress.stage === "queued" && progress.draftedCount === 0),
    completionArtifactsReady: inheritedRun?.completionArtifactsReady,
    heartbeatAt: inheritedRun?.heartbeatAt,
    lastProgressAt: inheritedRun?.lastProgressAt,
    workflowObservedAt: inheritedRun?.workflowObservedAt,
    dispatchAttempts: inheritedRun?.dispatchAttempts,
    rootErrorCode: inheritedRun?.rootErrorCode,
    rootErrorStage: inheritedRun?.rootErrorStage,
    blockingIncidentCategories: inheritedRun?.blockingIncidentCategories,
    supportReference: inheritedRun?.supportReference,
    cancellationRequestedAt:
      progress.cancellationRequestedAt ?? inheritedRun?.cancellationRequestedAt,
    pause:
      progress.stage === "awaiting_approval"
        ? {
            ...(inheritedRun?.pause?.kind === "outline_approval" ? inheritedRun.pause : {}),
            kind: "outline_approval",
          }
        : progress.stage === "awaiting_guidance"
          ? {
              ...(inheritedRun?.pause?.kind === "creative_decision" ? inheritedRun.pause : {}),
              kind: "creative_decision",
            }
          : progress.stage === "awaiting_credits"
            ? {
                ...(inheritedRun?.pause?.kind === "credits" ? inheritedRun.pause : {}),
                kind: "credits",
              }
            : null,
    health:
      terminalStatus === "failed" || terminalStatus === "cancelled"
        ? "needs_attention"
        : progress.stage === "awaiting_guidance" ||
            progress.stage === "awaiting_approval" ||
            progress.stage === "awaiting_credits"
          ? "waiting"
          : (inheritedRun?.health ?? "healthy"),
    spend: inheritedRun?.spend ?? { meteredUsd: 0, creditsUsed: 0, scope: "run" },
  };

  return deriveAuthoringJourney({
    project: {
      ...snapshot.project,
      brief: snapshot.artifacts.briefReady ? "Saved brief" : null,
      completedAt: snapshot.project.status === "complete" ? snapshot.project.updatedAt : null,
    },
    artifacts: {
      ...snapshot.artifacts,
      savedChapters: Math.max(snapshot.artifacts.savedChapters, progress.draftedCount),
      finalChapters: snapshot.artifacts.finalChapters,
      totalChapters: Math.max(snapshot.artifacts.totalChapters, progress.totalChapters),
    },
    access: snapshot.access,
    spend: snapshot.spend,
    run,
  });
}

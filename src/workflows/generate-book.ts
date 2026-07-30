import { createHook, FatalError, getWorkflowMetadata } from "workflow";
import { OUTLINE_REVISION_RESERVATION_KEY, type GenerationConfig } from "@/lib/run-events";
import type { Stage } from "@/lib/run-events";
import type { BookConcept, BookOutline } from "@/ai/schemas";
import type { ContinuityOutcome } from "@/ai/agents/continuity";
import { continuityPhaseKeys } from "@/ai/prompts/review-rubric";
import {
  conceptStep,
  chapterNumbersNeedingWorkStep,
  continuityFinalizeStep,
  continuityPhaseStep,
  continuityCreditCheckStep,
  chapterWaveCreditCheckStep,
  editChapterStep,
  editorialWaveCreditCheckStep,
  emitCost,
  entityBibleCreditCheckStep,
  entityBibleStep,
  emitProgress,
  finalizeStep,
  linkWorkflowRunStep,
  markRunStatus,
  notifyCreditsPausedStep,
  openingCreditCheckStep,
  outlineRevisionCreditCheckStep,
  outlineStep,
  prepareBookRunStep,
  readQualityGate,
  releaseCreditsStep,
  reserveCreditsStep,
  severResumeBillingLineageStep,
  writeChapterStep,
} from "./steps";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type OutlineApproval = { approved: boolean; notes?: string };

export async function generateBook(
  dbRunId: string,
  projectId: string,
  userId: string,
  config: GenerationConfig,
) {
  "use workflow";
  const ref = { dbRunId, projectId, userId };
  const { workflowRunId } = getWorkflowMetadata();

  // One top-up hook for the entire run: tokens belong to a single active hook,
  // and both the pre-flight and the per-wave checks may need to wait on it —
  // possibly more than once, since resuming only proves a button was clicked.
  const topUps = createHook<{ toppedUp: boolean }>({ token: `credits-topup:${dbRunId}` });
  const topUpEvents = topUps[Symbol.asyncIterator]();
  type CreditCheck = { balance: number; required: number; sufficient: boolean };
  type CreditResumeStage = Extract<
    Stage,
    "concept" | "outline" | "bible" | "chapters" | "editing" | "continuity" | "revising"
  >;

  const requireCreditGate = async (
    initial: CreditCheck,
    recheck: () => Promise<CreditCheck>,
    pct: number,
    action: string,
    resumeStage: CreditResumeStage,
    reservationKey: string,
  ): Promise<{ notified: boolean; reservationRef?: string }> => {
    let credit = initial;
    let notified = false;
    while (true) {
      // The read-only quote is for UX. This serialized hold is the actual
      // authorization boundary and closes cross-project/wave TOCTOU races.
      const authorization = await reserveCreditsStep(ref, credit.required, reservationKey);
      if (authorization.sufficient) {
        return {
          notified,
          ...(authorization.reservationRef ? { reservationRef: authorization.reservationRef } : {}),
        };
      }
      credit = authorization;
      await markRunStatus(ref, "awaiting_input");
      await emitProgress(ref, {
        type: "stage",
        stage: "awaiting_credits",
        pct,
        detail: `${credit.balance.toFixed(0)} of ${credit.required.toFixed(0)} credits needed ${action}`,
        resumeStage,
      });
      if (!notified) {
        await notifyCreditsPausedStep(ref, credit.balance, credit.required);
        notified = true;
      }
      const resumed = await topUpEvents.next();
      if (!resumed.value?.toppedUp) {
        throw new FatalError("Run cancelled while waiting for credits");
      }
      await markRunStatus(ref, "running");
      credit = await recheck();
    }
  };

  // A response-loss retry may dispatch the same durable DB run more than
  // once. Exactly one Workflow owns it; a linkage loser exits before the
  // failure handler can terminalize the winner's row.
  if (!(await linkWorkflowRunStep(ref, workflowRunId))) return;

  try {
    await markRunStatus(ref, "running");

    // Pre-flight: suspend BEFORE any metered work unless the wallet covers the
    // opening stretch (concept/outline/bible + the first wave). Deliberately
    // not the whole book: each wave is authorized independently, and a
    // zero-balance run must burn nothing.
    // Loop, not if: a resume only proves the user clicked the button, so the
    // balance is re-checked until it actually covers the opening stretch.
    const openingAuthorization = await requireCreditGate(
      await openingCreditCheckStep(ref, config),
      () => openingCreditCheckStep(ref, config),
      1,
      "to start",
      "concept",
      "opening",
    );

    let concept: BookConcept;
    let outline: BookOutline;
    try {
      await emitProgress(ref, { type: "stage", stage: "concept", pct: 2 });
      await emitProgress(ref, { type: "agent", agent: "concept", message: "Expanding the brief" });
      concept = await conceptStep(ref, config, openingAuthorization.reservationRef);
      await emitCost(ref);

      await emitProgress(ref, { type: "stage", stage: "outline", pct: 8 });
      await emitProgress(ref, {
        type: "agent",
        agent: "outliner",
        message: `Structuring "${concept.title}"`,
      });
      outline = await outlineStep(
        ref,
        config,
        concept,
        undefined,
        openingAuthorization.reservationRef,
      );
      await emitCost(ref);
    } finally {
      await releaseCreditsStep(ref, openingAuthorization.reservationRef);
    }

    if (config.requireOutlineApproval) {
      await markRunStatus(ref, "awaiting_input");
      await emitProgress(ref, { type: "stage", stage: "awaiting_approval", pct: 12 });
      const hook = createHook<OutlineApproval>({ token: `outline-approval:${dbRunId}` });
      const approval = await hook;
      await markRunStatus(ref, "running");
      if (!approval.approved) {
        // The revision is a new source of truth. Persist that ownership before
        // both authorization and metering so identical notes used by an older
        // source run cannot suppress this run's debit.
        await severResumeBillingLineageStep(ref);
        await emitProgress(ref, {
          type: "agent",
          agent: "outliner",
          message: "Revising the outline from your notes",
        });
        const revisionNotes = approval.notes ?? "Please revise the outline.";
        const revisionAuthorization = await requireCreditGate(
          await outlineRevisionCreditCheckStep(ref, config, revisionNotes),
          () => outlineRevisionCreditCheckStep(ref, config, revisionNotes),
          12,
          "to revise the outline",
          "outline",
          OUTLINE_REVISION_RESERVATION_KEY,
        );
        try {
          outline = await outlineStep(
            ref,
            config,
            concept,
            revisionNotes,
            revisionAuthorization.reservationRef,
          );
        } finally {
          await releaseCreditsStep(ref, revisionAuthorization.reservationRef);
        }
      }
    }

    // Recheck and reserve Bible work immediately before the first destructive
    // preparation boundary. A balance consumed by concept/outline pauses here
    // while the author's prior manuscript and canon are still untouched.
    const bibleAuthorization = await requireCreditGate(
      await entityBibleCreditCheckStep(ref, config),
      () => entityBibleCreditCheckStep(ref, config),
      12,
      "to begin the manuscript",
      "bible",
      "entity-bible",
    );

    // The generated plan remains run-local through human approval. Commit it
    // and archive/reset the old manuscript at one durable boundary before any
    // story-bible or prose work can observe the new canon.
    try {
      await prepareBookRunStep(ref, config);

      // Canon before prose: chapters draft four at a time, so the bible has to
      // exist before any of them can consult it.
      await emitProgress(ref, {
        type: "stage",
        stage: "bible",
        pct: 13,
        detail: "Building the people, places, and canon every chapter will share",
      });
      await emitProgress(ref, {
        type: "agent",
        agent: "entity-bible",
        message: "Building the story bible",
      });
      const bible = await entityBibleStep(
        ref,
        config,
        concept,
        outline,
        bibleAuthorization.reservationRef,
      );
      await emitProgress(ref, {
        type: "agent",
        agent: "entity-bible",
        message: `${bible.entityCount} entities, ${bible.relationshipCount} relationships`,
      });
      await emitCost(ref);
    } finally {
      await releaseCreditsStep(ref, bibleAuthorization.reservationRef);
    }

    const chapterNumbers = outline.chapters.map((c) => c.number);
    const total = chapterNumbers.length;
    let done = 0;
    await emitProgress(ref, {
      type: "stage",
      stage: "chapters",
      pct: 15,
      detail: `0 of ${total} chapters drafted`,
    });

    for (const wave of chunk(chapterNumbers, config.waveSize)) {
      const pendingWave = await chapterNumbersNeedingWorkStep(ref, wave);
      done += wave.length - pendingWave.length;
      if (pendingWave.length === 0) {
        await emitProgress(ref, {
          type: "stage",
          stage: "chapters",
          pct: 15 + Math.round(55 * (done / total)),
          detail: `${done} of ${total} chapters drafted · completed work reused`,
        });
        continue;
      }
      // Check the wallet between waves rather than only up front: a long book
      // can outrun its estimate. Running short suspends the run instead of
      // failing it, so every chapter already drafted is kept and no work is
      // re-billed on resume.
      const waveAuthorization = await requireCreditGate(
        await chapterWaveCreditCheckStep(ref, config, pendingWave),
        () => chapterWaveCreditCheckStep(ref, config, pendingWave),
        15 + Math.round(55 * (done / total)),
        "to continue writing",
        "chapters",
        `chapter-wave:${wave.join(",")}`,
      );
      if (waveAuthorization.notified) {
        await emitProgress(ref, {
          type: "stage",
          stage: "chapters",
          pct: 15 + Math.round(55 * (done / total)),
          detail: `${done} of ${total} chapters drafted · production resumed`,
        });
      }

      try {
        await Promise.all(
          pendingWave.map((n) =>
            writeChapterStep(ref, config, n, waveAuthorization.reservationRef),
          ),
        );
      } finally {
        await releaseCreditsStep(ref, waveAuthorization.reservationRef);
      }
      done += pendingWave.length;
      await emitProgress(ref, {
        type: "stage",
        stage: "chapters",
        pct: 15 + Math.round(55 * (done / total)),
        detail: `${done} of ${total} chapters drafted`,
      });
      await emitCost(ref);
    }

    if (config.tier !== "draft") {
      await emitProgress(ref, { type: "stage", stage: "editing", pct: 72 });
      const gateList = config.tier === "premium" ? chapterNumbers : await readQualityGate(ref, 0.7);
      for (const wave of chunk(gateList, config.waveSize)) {
        const editAuthorization = await requireCreditGate(
          await editorialWaveCreditCheckStep(ref, config, wave, "editorial"),
          () => editorialWaveCreditCheckStep(ref, config, wave, "editorial"),
          72,
          "to continue editing",
          "editing",
          `editorial-wave:${wave.join(",")}`,
        );
        try {
          await Promise.all(
            wave.map((n) =>
              editChapterStep(ref, config, n, undefined, editAuthorization.reservationRef),
            ),
          );
        } finally {
          await releaseCreditsStep(ref, editAuthorization.reservationRef);
        }
      }
      await emitCost(ref);
    }

    await emitProgress(ref, { type: "stage", stage: "continuity", pct: 85 });
    await emitProgress(ref, {
      type: "agent",
      agent: "continuity",
      message: "Reading the manuscript for consistency",
    });
    const outcomes: ContinuityOutcome[] = [];
    for (const phaseKey of continuityPhaseKeys(config.tier)) {
      const continuityAuthorization = await requireCreditGate(
        await continuityCreditCheckStep(ref, config, phaseKey),
        () => continuityCreditCheckStep(ref, config, phaseKey),
        85,
        "to continue the manuscript review",
        "continuity",
        `continuity:${phaseKey}`,
      );
      try {
        outcomes.push(
          await continuityPhaseStep(ref, config, phaseKey, continuityAuthorization.reservationRef),
        );
      } finally {
        await releaseCreditsStep(ref, continuityAuthorization.reservationRef);
      }
    }
    const report = await continuityFinalizeStep(ref, outcomes);
    await emitCost(ref);

    if (config.tier !== "draft" && report.score < 0.7 && report.worstChapters.length > 0) {
      await emitProgress(ref, { type: "stage", stage: "revising", pct: 92 });
      const issueNotes = report.issues
        .map(
          (i) => `[${i.severity}] ch ${i.chapters.join(",")}: ${i.description} → ${i.suggestedFix}`,
        )
        .join("\n");
      const revisionTargets = report.worstChapters.slice(0, 3);
      const revisionAuthorization = await requireCreditGate(
        await editorialWaveCreditCheckStep(ref, config, revisionTargets, "revision"),
        () => editorialWaveCreditCheckStep(ref, config, revisionTargets, "revision"),
        92,
        "to apply continuity revisions",
        "revising",
        `continuity-revision:${revisionTargets.join(",")}`,
      );
      try {
        await Promise.all(
          revisionTargets.map((n) =>
            editChapterStep(ref, config, n, issueNotes, revisionAuthorization.reservationRef),
          ),
        );
      } finally {
        await releaseCreditsStep(ref, revisionAuthorization.reservationRef);
      }
      await emitCost(ref);
    }

    await emitProgress(ref, { type: "stage", stage: "finalizing", pct: 97 });
    await finalizeStep(ref);
    await markRunStatus(ref, "completed");
    await emitProgress(ref, {
      type: "stage",
      stage: "done",
      pct: 100,
      detail: report.recommendation,
    });
    return { score: report.score, recommendation: report.recommendation };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    await markRunStatus(ref, "failed", message);
    await emitProgress(ref, { type: "error", message, fatal: true });
    throw error instanceof FatalError ? error : new FatalError(message);
  }
}

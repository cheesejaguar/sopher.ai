import { createHook, FatalError, getWorkflowMetadata } from "workflow";
import {
  AUTHORING_CANCELLATION_MESSAGE,
  AUTHORING_RUN_INACTIVE_MESSAGE,
} from "@/lib/authoring-cancellation";
import { withPreservedPrimaryError } from "@/lib/async-cleanup";
import { authoringFailureMessage, classifyAuthoringFailure } from "@/lib/authoring-failures";
import { notifyAuthoringFailureStep } from "./notify-authoring-failure";
import { OUTLINE_REVISION_RESERVATION_KEY, type GenerationConfig } from "@/lib/run-events";
import type { Stage } from "@/lib/run-events";
import type { ContinuityOutcome } from "@/ai/agents/continuity";
import type { BookConcept, BookOutline } from "@/ai/schemas";
import { continuityPhaseKeys } from "@/ai/prompts/review-rubric";
import {
  conceptStep,
  consumeCreativeDecisionStep,
  creativeOpeningCreditCheckStep,
  chapterNumbersNeedingWorkStep,
  continuityFinalizeStep,
  continuityPhaseStep,
  continuityCreditCheckStep,
  chapterWaveCreditCheckStep,
  clearAuthoringPauseStep,
  consumeAuthoringRunInputStep,
  editChapterStep,
  editorialWaveCreditCheckStep,
  emitCost,
  entityBibleCreditCheckStep,
  entityBibleStep,
  emitProgress,
  finalizeStep,
  linkWorkflowRunStep,
  markRunStatus,
  markAuthoringPauseRegisteredStep,
  markCreativeQuestionPauseRegisteredStep,
  hydratePreManuscriptRetryStep,
  notifyCreditsPausedStep,
  notifyOutlineApprovalStep,
  openingCreditCheckStep,
  initialOutlineCreditCheckStep,
  outlineRevisionCreditCheckStep,
  outlineStep,
  prepareBookRunStep,
  prepareCreativeQuestionStep,
  readQualityGate,
  releaseCreditsStep,
  reserveCreditsStep,
  severResumeBillingLineageStep,
  writeChapterStep,
  allocateAuthoringPauseStep,
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
  const usesDurableInputs = config.protocolVersion === 2 || config.protocolVersion === 3;

  // One top-up hook for the entire run: tokens belong to a single active hook,
  // and both the pre-flight and the per-wave checks may need to wait on it —
  // possibly more than once, since resuming only proves a button was clicked.
  const legacyTopUps = usesDurableInputs
    ? null
    : createHook<{ toppedUp: boolean }>({ token: `credits-topup:${dbRunId}` });
  const legacyTopUpEvents = legacyTopUps?.[Symbol.asyncIterator]();
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
      let pauseVersion: number | undefined;
      let waitForTopUp: () => Promise<{ toppedUp: boolean }>;
      if (usesDurableInputs) {
        const pause = await allocateAuthoringPauseStep(ref, "credits_topup", {
          balanceCredits: credit.balance,
          requiredCredits: credit.required,
          resumeStage,
        });
        pauseVersion = pause.version;
        const hook = createHook<{ inputId: string }>({ token: pause.token });
        const conflict = await hook.getConflict();
        if (conflict) {
          throw new FatalError(`Credit input token belongs to Workflow ${conflict.runId}`);
        }
        await markAuthoringPauseRegisteredStep(ref, "credits_topup", pause.version);
        waitForTopUp = async () => {
          const delivery = await hook;
          const payload = await consumeAuthoringRunInputStep(
            ref,
            "credits_topup",
            pause.version,
            delivery.inputId,
          );
          if (!payload || payload.toppedUp !== true) {
            throw new FatalError("Credit input did not match the active pause");
          }
          await clearAuthoringPauseStep(ref, "credits_topup", pause.version);
          return { toppedUp: true };
        };
      } else {
        await markRunStatus(ref, "awaiting_input");
        waitForTopUp = async () => {
          const resumed = await legacyTopUpEvents!.next();
          return { toppedUp: resumed.value?.toppedUp === true };
        };
      }
      await emitProgress(ref, {
        type: "stage",
        stage: "awaiting_credits",
        pct,
        detail: `${credit.balance.toFixed(0)} of ${credit.required.toFixed(0)} credits needed ${action}`,
        resumeStage,
      });
      if (!notified) {
        await notifyCreditsPausedStep(ref, credit.balance, credit.required, pauseVersion);
        notified = true;
      }
      const resumed = await waitForTopUp();
      if (!resumed.toppedUp) {
        throw new FatalError("Run cancelled while waiting for credits");
      }
      if (!usesDurableInputs) await markRunStatus(ref, "running");
      credit = await recheck();
    }
  };

  const withReservation = <T>(
    reservationRef: string | undefined,
    operation: () => Promise<T>,
  ): Promise<T> =>
    withPreservedPrimaryError(
      operation,
      () => releaseCreditsStep(ref, reservationRef),
      (cleanupError) => {
        console.error("Reservation cleanup failed after authoring had already failed", {
          runId: ref.dbRunId,
          cleanupError,
        });
      },
    );

  // A response-loss retry may dispatch the same durable DB run more than
  // once. Exactly one Workflow owns it; a linkage loser exits before the
  // failure handler can terminalize the winner's row.
  if (!(await linkWorkflowRunStep(ref, workflowRunId))) return;

  try {
    await markRunStatus(ref, "running");
    await hydratePreManuscriptRetryStep(ref, config);

    // Suspend before metered work. V3 deliberately releases the concept and
    // question reservation before waiting for the author, then authorizes the
    // outline separately. A durable human pause must never hold wallet funds.
    let concept: BookConcept;
    let outline: BookOutline;
    if (config.protocolVersion === 3) {
      const conceptAuthorization = await requireCreditGate(
        await creativeOpeningCreditCheckStep(ref, config),
        () => creativeOpeningCreditCheckStep(ref, config),
        1,
        "to develop the story direction",
        "concept",
        "creative-opening",
      );
      const creativeOpening = await withReservation(
        conceptAuthorization.reservationRef,
        async () => {
          await emitProgress(ref, { type: "stage", stage: "concept", pct: 2 });
          await emitProgress(ref, {
            type: "agent",
            agent: "concept",
            message: "Expanding the brief",
          });
          const developedConcept = await conceptStep(
            ref,
            config,
            conceptAuthorization.reservationRef,
          );
          const question = await prepareCreativeQuestionStep(
            ref,
            config,
            developedConcept,
            conceptAuthorization.reservationRef,
          );
          await emitCost(ref);
          return { concept: developedConcept, question };
        },
      );
      concept = creativeOpening.concept;

      if (creativeOpening.question) {
        const question = creativeOpening.question;
        const pause = await allocateAuthoringPauseStep(ref, "creative_decision", {
          questionId: question.id,
          resumeStage: "outline",
        });
        const hook = createHook<{ inputId: string }>({ token: pause.token });
        const conflict = await hook.getConflict();
        if (conflict) {
          throw new FatalError(`Creative decision token belongs to Workflow ${conflict.runId}`);
        }
        await markCreativeQuestionPauseRegisteredStep(ref, question.id, pause.version);
        await emitProgress(ref, {
          type: "stage",
          stage: "awaiting_guidance",
          pct: 6,
          detail: "Choose the direction that should shape the chapter plan",
        });
        await emitProgress(ref, {
          type: "agent",
          agent: "outliner",
          message: "Waiting for your story direction before building the outline",
        });
        const delivery = await hook;
        const decision = await consumeCreativeDecisionStep(ref, pause.version, delivery.inputId);
        if (!decision) {
          throw new FatalError("Creative direction did not match the active question");
        }
        await clearAuthoringPauseStep(ref, "creative_decision", pause.version);
      }

      const outlineAuthorization = await requireCreditGate(
        await initialOutlineCreditCheckStep(ref, config),
        () => initialOutlineCreditCheckStep(ref, config),
        8,
        "to build the chapter plan",
        "outline",
        "initial-outline",
      );
      outline = await withReservation(outlineAuthorization.reservationRef, async () => {
        await emitProgress(ref, { type: "stage", stage: "outline", pct: 8 });
        await emitProgress(ref, {
          type: "agent",
          agent: "outliner",
          message: `Structuring "${concept.title}"`,
        });
        const result = await outlineStep(
          ref,
          config,
          concept,
          undefined,
          outlineAuthorization.reservationRef,
        );
        await emitCost(ref);
        return result;
      });
    } else {
      const openingAuthorization = await requireCreditGate(
        await openingCreditCheckStep(ref, config),
        () => openingCreditCheckStep(ref, config),
        1,
        "to start",
        "concept",
        "opening",
      );

      const opening = await withReservation(openingAuthorization.reservationRef, async () => {
        await emitProgress(ref, { type: "stage", stage: "concept", pct: 2 });
        await emitProgress(ref, {
          type: "agent",
          agent: "concept",
          message: "Expanding the brief",
        });
        const developedConcept = await conceptStep(
          ref,
          config,
          openingAuthorization.reservationRef,
        );
        await emitCost(ref);

        await emitProgress(ref, { type: "stage", stage: "outline", pct: 8 });
        await emitProgress(ref, {
          type: "agent",
          agent: "outliner",
          message: `Structuring "${developedConcept.title}"`,
        });
        const developedOutline = await outlineStep(
          ref,
          config,
          developedConcept,
          undefined,
          openingAuthorization.reservationRef,
        );
        await emitCost(ref);
        return { concept: developedConcept, outline: developedOutline };
      });
      concept = opening.concept;
      outline = opening.outline;
    }

    if (config.requireOutlineApproval) {
      let approval: OutlineApproval;
      if (usesDurableInputs) {
        const pause = await allocateAuthoringPauseStep(ref, "outline_approval");
        const hook = createHook<{ inputId: string }>({ token: pause.token });
        const conflict = await hook.getConflict();
        if (conflict) {
          throw new FatalError(`Outline input token belongs to Workflow ${conflict.runId}`);
        }
        await markAuthoringPauseRegisteredStep(ref, "outline_approval", pause.version);
        await emitProgress(ref, { type: "stage", stage: "awaiting_approval", pct: 12 });
        await notifyOutlineApprovalStep(ref, pause.version);
        const delivery = await hook;
        const payload = await consumeAuthoringRunInputStep(
          ref,
          "outline_approval",
          pause.version,
          delivery.inputId,
        );
        if (!payload || typeof payload.approved !== "boolean") {
          throw new FatalError("Outline input did not match the active pause");
        }
        approval = {
          approved: payload.approved,
          ...(typeof payload.notes === "string" ? { notes: payload.notes } : {}),
        };
        await clearAuthoringPauseStep(ref, "outline_approval", pause.version);
      } else {
        await markRunStatus(ref, "awaiting_input");
        await emitProgress(ref, { type: "stage", stage: "awaiting_approval", pct: 12 });
        const hook = createHook<OutlineApproval>({ token: `outline-approval:${dbRunId}` });
        approval = await hook;
        await markRunStatus(ref, "running");
      }
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
        outline = await withReservation(revisionAuthorization.reservationRef, () =>
          outlineStep(ref, config, concept, revisionNotes, revisionAuthorization.reservationRef),
        );
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
    await withReservation(bibleAuthorization.reservationRef, async () => {
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
    });

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

      await withReservation(waveAuthorization.reservationRef, async () => {
        await Promise.all(
          pendingWave.map((n) =>
            writeChapterStep(ref, config, n, waveAuthorization.reservationRef),
          ),
        );
      });
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
        await withReservation(editAuthorization.reservationRef, async () => {
          await Promise.all(
            wave.map((n) =>
              editChapterStep(ref, config, n, undefined, editAuthorization.reservationRef),
            ),
          );
        });
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
      await withReservation(continuityAuthorization.reservationRef, async () => {
        outcomes.push(
          await continuityPhaseStep(ref, config, phaseKey, continuityAuthorization.reservationRef),
        );
      });
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
      await withReservation(revisionAuthorization.reservationRef, async () => {
        await Promise.all(
          revisionTargets.map((n) =>
            editChapterStep(ref, config, n, issueNotes, revisionAuthorization.reservationRef),
          ),
        );
      });
      await emitCost(ref);
    }

    await emitProgress(ref, { type: "stage", stage: "finalizing", pct: 97 });
    await finalizeStep(ref, report.recommendation);
    return { score: report.score, recommendation: report.recommendation };
  } catch (error) {
    const message = authoringFailureMessage(error);
    const failure = classifyAuthoringFailure(error);
    if (message === AUTHORING_RUN_INACTIVE_MESSAGE) {
      throw error instanceof FatalError ? error : new FatalError(message);
    }
    const cancelled = message === AUTHORING_CANCELLATION_MESSAGE;
    try {
      await markRunStatus(
        ref,
        cancelled ? "cancelled" : "failed",
        message,
        cancelled ? undefined : failure,
      );
      if (!cancelled) await notifyAuthoringFailureStep(ref);
    } catch (statusError) {
      console.error("Could not persist the initiating authoring failure", {
        runId: ref.dbRunId,
        statusError,
      });
    }
    try {
      await emitProgress(
        ref,
        cancelled
          ? { type: "stage", stage: "cancelled", pct: 100, detail: "Stopped safely" }
          : { type: "error", message, fatal: true },
      );
    } catch (eventError) {
      console.warn("Could not publish the initiating authoring failure", {
        runId: ref.dbRunId,
        eventError,
      });
    }
    throw error instanceof FatalError ? error : new FatalError(message);
  }
}

import { createHook, FatalError } from "workflow";
import type { GenerationConfig } from "@/lib/run-events";
import type { BookOutline } from "@/ai/schemas";
import { continuityPhaseKeys, type ContinuityOutcome } from "@/ai/agents/continuity";
import {
  conceptStep,
  continuityFinalizeStep,
  continuityPhaseStep,
  editChapterStep,
  emitCost,
  creditCheckStep,
  entityBibleStep,
  emitProgress,
  finalizeStep,
  markRunStatus,
  notifyCreditsPausedStep,
  outlineStep,
  readQualityGate,
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

  // One top-up hook for the entire run: tokens belong to a single active hook,
  // and both the pre-flight and the per-wave checks may need to wait on it —
  // possibly more than once, since resuming only proves a button was clicked.
  const topUps = createHook<{ toppedUp: boolean }>({ token: `credits-topup:${dbRunId}` });
  const topUpEvents = topUps[Symbol.asyncIterator]();

  try {
    await markRunStatus(ref, "running");

    // Pre-flight: suspend BEFORE any metered work unless the wallet covers the
    // opening stretch (concept/outline/bible + the first wave). Deliberately
    // not the whole book — the welcome grant is sized to let a book begin and
    // pause at a natural seam, and zero-balance runs must burn nothing.
    // Loop, not if: a resume only proves the user clicked the button, so the
    // balance is re-checked until it actually covers the opening stretch.
    let preflight = await creditCheckStep(ref, config, config.waveSize, {
      includeBookOverhead: true,
    });
    while (!preflight.sufficient) {
      await markRunStatus(ref, "awaiting_input");
      await emitProgress(ref, {
        type: "stage",
        stage: "awaiting_credits",
        pct: 1,
        detail: `${preflight.balance.toFixed(0)} of ${preflight.required.toFixed(0)} credits needed to start`,
      });
      await notifyCreditsPausedStep(ref, preflight.balance, preflight.required);
      const go = await topUpEvents.next();
      if (!go.value?.toppedUp) throw new FatalError("Run cancelled while waiting for credits");
      await markRunStatus(ref, "running");
      preflight = await creditCheckStep(ref, config, config.waveSize, {
        includeBookOverhead: true,
      });
    }

    await emitProgress(ref, { type: "stage", stage: "concept", pct: 2 });
    await emitProgress(ref, { type: "agent", agent: "concept", message: "Expanding the brief" });
    const concept = await conceptStep(ref, config);
    await emitCost(ref);

    await emitProgress(ref, { type: "stage", stage: "outline", pct: 8 });
    await emitProgress(ref, {
      type: "agent",
      agent: "outliner",
      message: `Structuring "${concept.title}"`,
    });
    let outline: BookOutline = await outlineStep(ref, config, concept);
    await emitCost(ref);

    if (config.requireOutlineApproval) {
      await markRunStatus(ref, "awaiting_input");
      await emitProgress(ref, { type: "stage", stage: "awaiting_approval", pct: 12 });
      const hook = createHook<OutlineApproval>({ token: `outline-approval:${dbRunId}` });
      const approval = await hook;
      await markRunStatus(ref, "running");
      if (!approval.approved) {
        await emitProgress(ref, {
          type: "agent",
          agent: "outliner",
          message: "Revising the outline from your notes",
        });
        outline = await outlineStep(ref, config, concept, approval.notes);
      }
    }

    // Canon before prose: chapters draft four at a time, so the bible has to
    // exist before any of them can consult it.
    await emitProgress(ref, {
      type: "agent",
      agent: "entity-bible",
      message: "Building the story bible",
    });
    const bible = await entityBibleStep(ref, config, concept, outline);
    await emitProgress(ref, {
      type: "agent",
      agent: "entity-bible",
      message: `${bible.entityCount} entities, ${bible.relationshipCount} relationships`,
    });
    await emitCost(ref);

    const chapterNumbers = outline.chapters.map((c) => c.number);
    const total = chapterNumbers.length;
    let done = 0;
    await emitProgress(ref, { type: "stage", stage: "chapters", pct: 15 });

    for (const wave of chunk(chapterNumbers, config.waveSize)) {
      // Check the wallet between waves rather than only up front: a long book
      // can outrun its estimate. Running short suspends the run instead of
      // failing it, so every chapter already drafted is kept and no work is
      // re-billed on resume.
      let credit = await creditCheckStep(ref, config, Math.min(config.waveSize, total - done));
      while (!credit.sufficient) {
        await markRunStatus(ref, "awaiting_input");
        await emitProgress(ref, {
          type: "stage",
          stage: "awaiting_credits",
          pct: 15 + Math.round(55 * (done / total)),
          detail: `${credit.balance.toFixed(0)} of ${credit.required.toFixed(0)} credits needed to continue`,
        });
        await notifyCreditsPausedStep(ref, credit.balance, credit.required);
        const resumed = await topUpEvents.next();
        if (!resumed.value?.toppedUp) {
          throw new FatalError("Run cancelled while waiting for credits");
        }
        await markRunStatus(ref, "running");
        credit = await creditCheckStep(ref, config, Math.min(config.waveSize, total - done));
      }

      await Promise.all(wave.map((n) => writeChapterStep(ref, config, n)));
      done += wave.length;
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
        await Promise.all(wave.map((n) => editChapterStep(ref, config, n)));
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
      outcomes.push(await continuityPhaseStep(ref, config, phaseKey));
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
      await Promise.all(
        report.worstChapters.slice(0, 3).map((n) => editChapterStep(ref, config, n, issueNotes)),
      );
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

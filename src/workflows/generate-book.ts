import { createHook, FatalError } from "workflow";
import type { GenerationConfig } from "@/lib/run-events";
import type { BookOutline } from "@/ai/schemas";
import { continuityPhaseKeys, type ContinuityOutcome } from "@/ai/agents/continuity";
import {
  checkBudgetStep,
  conceptStep,
  continuityFinalizeStep,
  continuityPhaseStep,
  editChapterStep,
  emitCost,
  entityBibleStep,
  emitProgress,
  finalizeStep,
  markRunStatus,
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

  try {
    await markRunStatus(ref, "running");
    await checkBudgetStep(ref, config);

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

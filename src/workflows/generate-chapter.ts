import { FatalError } from "workflow";
import type { GenerationConfig } from "@/lib/run-events";
import { emitCost, emitProgress, markRunStatus, resetChapterStep, writeChapterStep } from "./steps";

/**
 * Regenerates a single chapter in place. The old prose is snapshotted to the
 * revision history first, then the chapter runs back through the full
 * plan → draft → critique → revise pipeline with current canon (story bible,
 * neighbouring summaries) as context.
 */
export async function generateChapter(
  dbRunId: string,
  projectId: string,
  userId: string,
  chapterNumber: number,
  config: GenerationConfig,
) {
  "use workflow";
  const ref = { dbRunId, projectId, userId };

  try {
    await markRunStatus(ref, "running");
    await emitProgress(ref, { type: "stage", stage: "chapters", pct: 5 });
    await emitProgress(ref, {
      type: "agent",
      agent: "writer",
      message: `Rewriting chapter ${chapterNumber}`,
    });

    await resetChapterStep(ref, chapterNumber);
    const result = await writeChapterStep(ref, config, chapterNumber);
    await emitCost(ref);

    await markRunStatus(ref, "completed");
    await emitProgress(ref, {
      type: "stage",
      stage: "done",
      pct: 100,
      detail: `Chapter ${chapterNumber} rewritten — ${result.wordCount.toLocaleString()} words`,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chapter regeneration failed";
    await markRunStatus(ref, "failed", message);
    await emitProgress(ref, { type: "error", message, fatal: true });
    throw error instanceof FatalError ? error : new FatalError(message);
  }
}

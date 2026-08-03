import { meteredOperationCeilingUsd } from "@/ai/metering-limits";
import { MODELS } from "@/ai/models";
import type { GenerationConfig } from "@/lib/run-events";

export type ResumeChapterMeteredWork = {
  chapterNumber: number;
  /** No durable writer output exists; plan/draft/critique work is still pending. */
  writer: "full" | "critique" | "none";
  summary: boolean;
  /** "expected" preserves the standard-tier 30% estimate for an unwritten chapter. */
  editorial: "expected" | "full" | "none";
  revision: boolean;
};

export type ResumeOpeningWork = {
  entityBible: boolean;
  chapters: ResumeChapterMeteredWork[];
  continuityPhasesRemaining: number;
  continuityPhasesTotal: number;
};

function operationCeiling(config: GenerationConfig, operation: string): number {
  const models = MODELS[config.tier];
  const model =
    operation === "concept.expand" || operation === "concept.refine"
      ? models.concept
      : operation === "creative.question"
        ? models.outline
        : operation.startsWith("outliner.")
          ? models.outline
          : operation === "entity.bible" || operation === "summarizer.chapter"
            ? models.summarizer
            : operation === "writer.plan"
              ? models.planner
              : operation === "writer.draft" || operation === "writer.revise"
                ? models.prose
                : operation === "writer.critique"
                  ? models.critic
                  : operation === "editor.edit"
                    ? models.editor
                    : models.continuity;
  const maxOutputTokensPerStep =
    operation === "writer.draft"
      ? Math.round(Math.min(10_000, config.targetWordsPerChapter * 1.2) * 1.5)
      : undefined;
  return meteredOperationCeilingUsd({ model, operation, maxOutputTokensPerStep });
}

export function entityBibleRequiredUsd(config: GenerationConfig): number {
  return operationCeiling(config, "entity.bible");
}

export function chapterWaveRequiredUsd(
  config: GenerationConfig,
  chapters: ResumeChapterMeteredWork[],
): number {
  return chapters.reduce((requiredUsd, chapter) => {
    const possibleCalls: number[] = [];
    if (chapter.writer === "full") {
      possibleCalls.push(
        operationCeiling(config, "writer.plan"),
        operationCeiling(config, "writer.draft"),
      );
      if (config.tier !== "draft") {
        possibleCalls.push(
          operationCeiling(config, "writer.critique"),
          operationCeiling(config, "writer.revise"),
        );
      }
    } else if (chapter.writer === "critique") {
      possibleCalls.push(
        operationCeiling(config, "writer.critique"),
        operationCeiling(config, "writer.revise"),
      );
    }
    if (chapter.summary) {
      possibleCalls.push(operationCeiling(config, "summarizer.chapter"));
    }
    // Actual spend from an earlier sequential call remains debited while the
    // next call claims its ceiling. Summing the branch is therefore the only
    // bound that also works for an author whose balance equals this gate.
    return requiredUsd + possibleCalls.reduce((total, ceiling) => total + ceiling, 0);
  }, 0);
}

export function singleChapterRequiredUsd(config: GenerationConfig): number {
  return chapterWaveRequiredUsd(config, [
    {
      chapterNumber: 1,
      writer: "full",
      summary: true,
      editorial: "none",
      revision: false,
    },
  ]);
}

export function editorialWaveRequiredUsd(
  config: GenerationConfig,
  chapters: ResumeChapterMeteredWork[],
  mode: "editorial" | "revision",
): number {
  const fullUsd = operationCeiling(config, "editor.edit");
  return chapters.reduce((requiredUsd, chapter) => {
    if (mode === "revision") return requiredUsd + (chapter.revision ? fullUsd : 0);
    if (chapter.editorial === "expected") return requiredUsd + fullUsd;
    if (chapter.editorial === "full") return requiredUsd + fullUsd;
    return requiredUsd;
  }, 0);
}

export function continuityPhaseRequiredUsd(config: GenerationConfig): number {
  return operationCeiling(config, "continuity.phase");
}

/** Conservative gate for a user-requested outline regeneration. */
export function outlineRevisionRequiredUsd(config: GenerationConfig): number {
  return [
    operationCeiling(config, "outliner.plan"),
    operationCeiling(config, "outliner.outline"),
    operationCeiling(config, "outliner.selfCheck"),
  ].reduce((total, ceiling) => total + ceiling, 0);
}

export function conceptRequiredUsd(config: GenerationConfig): number {
  return ["concept.expand", "concept.refine"].reduce(
    (total, operation) => total + operationCeiling(config, operation),
    0,
  );
}

export function creativeQuestionRequiredUsd(config: GenerationConfig): number {
  return operationCeiling(config, "creative.question");
}

export function initialOutlineRequiredUsd(config: GenerationConfig): number {
  return outlineRevisionRequiredUsd(config);
}

/** Authorization ceiling for the concept + complete outline actually run here. */
export function freshOpeningRequiredUsd(config: GenerationConfig): number {
  return [
    operationCeiling(config, "concept.expand"),
    operationCeiling(config, "concept.refine"),
    operationCeiling(config, "outliner.plan"),
    operationCeiling(config, "outliner.outline"),
    operationCeiling(config, "outliner.selfCheck"),
  ].reduce((total, ceiling) => total + ceiling, 0);
}

/**
 * Prices the first phase a compatible prepared retry will actually execute.
 * Later phases have their own just-in-time gates, so unrelated editorial or
 * continuity tails cannot inflate (or be accidentally consumed by) a writer
 * wave.
 */
export function resumeOpeningRequiredUsd(
  config: GenerationConfig,
  work: ResumeOpeningWork,
): number {
  if (work.entityBible) return entityBibleRequiredUsd(config);

  const ordered = [...work.chapters].sort(
    (left, right) => left.chapterNumber - right.chapterNumber,
  );
  const writerWave = ordered
    .filter((chapter) => chapter.writer !== "none" || chapter.summary)
    .slice(0, config.waveSize);
  if (writerWave.length > 0) return chapterWaveRequiredUsd(config, writerWave);

  const editorialWave = ordered
    .filter((chapter) => chapter.editorial !== "none")
    .slice(0, config.waveSize);
  if (editorialWave.length > 0) {
    return editorialWaveRequiredUsd(config, editorialWave, "editorial");
  }

  if (work.continuityPhasesRemaining > 0 && work.continuityPhasesTotal > 0) {
    return continuityPhaseRequiredUsd(config);
  }

  const revisions = ordered.filter((chapter) => chapter.revision);
  return revisions.length > 0 ? editorialWaveRequiredUsd(config, revisions, "revision") : 0;
}

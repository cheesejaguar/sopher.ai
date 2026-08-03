import { MODELS, type QualityTier } from "@/ai/models";
import { meteredOperationCeilingCredits } from "@/ai/metering-limits";
import { canonicalizeCreditRequirement } from "@/lib/billing/credits-shared";

export const MANUSCRIPT_EDIT_INSTRUCTION_MAX = 1_000;
export const MANUSCRIPT_EDIT_CHAPTER_MAX_CHARS = 80_000;

export type ManuscriptEditPassCompletion = {
  sourceRunId: string;
  reviewedChapterCount: number;
  suggestionCount: number;
  completedAt: string;
};

export type ManuscriptEditPassChapterCheckpoint = {
  chapterVersion: number;
  contentDigest: string;
  suggestionCount: number;
};

/**
 * A deliberately small config contract for a bounded, non-destructive edit
 * pass. It lives beside (rather than inside) full-book GenerationConfig so a
 * deployment-pinned book Workflow never starts interpreting edit-only state.
 */
export type ManuscriptEditPassConfig = {
  protocolVersion: 3;
  dispatchReady: true;
  tier: QualityTier;
  targetChapters: number;
  targetWordsPerChapter: number;
  requireOutlineApproval: false;
  waveSize: 1;
  editPass: {
    version: 1;
    instruction: string;
    instructionDigest: string;
    reviewedChapters?: Record<string, ManuscriptEditPassChapterCheckpoint>;
    completion?: ManuscriptEditPassCompletion;
  };
};

export function normalizeManuscriptEditInstruction(instruction: string): string {
  return instruction.replace(/\s+/g, " ").trim();
}

export function manuscriptEditCreditsPerChapter(tier: QualityTier): number {
  return meteredOperationCeilingCredits({
    model: MODELS[tier].editor,
    operation: "editor.review",
  });
}

export function manuscriptEditMaximumCredits(tier: QualityTier, chapterCount: number): number {
  return canonicalizeCreditRequirement(
    manuscriptEditCreditsPerChapter(tier) * Math.max(0, chapterCount),
  );
}

export function readManuscriptEditPassCompletion(
  config: unknown,
): ManuscriptEditPassCompletion | null {
  if (!config || typeof config !== "object") return null;
  const editPass = (config as { editPass?: unknown }).editPass;
  if (!editPass || typeof editPass !== "object") return null;
  const completion = (editPass as { completion?: unknown }).completion;
  if (!completion || typeof completion !== "object") return null;

  const value = completion as Partial<ManuscriptEditPassCompletion>;
  if (
    typeof value.sourceRunId !== "string" ||
    typeof value.reviewedChapterCount !== "number" ||
    !Number.isInteger(value.reviewedChapterCount) ||
    value.reviewedChapterCount < 1 ||
    typeof value.suggestionCount !== "number" ||
    !Number.isInteger(value.suggestionCount) ||
    value.suggestionCount < 0 ||
    typeof value.completedAt !== "string" ||
    Number.isNaN(Date.parse(value.completedAt))
  ) {
    return null;
  }
  return value as ManuscriptEditPassCompletion;
}

export function manuscriptEditPassCompletionIsReady(runId: string, config: unknown): boolean {
  return readManuscriptEditPassCompletion(config)?.sourceRunId === runId;
}

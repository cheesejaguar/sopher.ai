import { MODELS, type QualityTier } from "./models";
import { calculateUsd } from "@/lib/billing/pricing";

const TOKENS_PER_WORD = 1.35;

export type StageEstimate = {
  stage: string;
  usd: number;
};

export type BookEstimate = {
  tier: QualityTier;
  chapters: number;
  wordsPerChapter: number;
  totalUsd: number;
  stages: StageEstimate[];
  estimatedMinutes: number;
};

/**
 * Transparent per-stage cost model. Calibrated against the metered llm_calls
 * ground truth as real books are generated; estimates carry ±30% uncertainty.
 */
export function estimateBookCost(
  tier: QualityTier,
  chapters: number,
  wordsPerChapter: number,
): BookEstimate {
  const m = MODELS[tier];
  const chapterOutputTokens = wordsPerChapter * TOKENS_PER_WORD;
  // Context discipline: cached system prefix + outline slice + rolling summaries + tool results.
  const chapterInputTokens = 6_500;
  const cachedShare = 0.65;

  const stages: StageEstimate[] = [];

  const conceptOutline = calculateUsd(m.concept, { inputTokens: 3_000, outputTokens: 1_500 });
  const outlineUsd = calculateUsd(m.outline, {
    inputTokens: 5_000,
    outputTokens: 350 * chapters,
  });
  stages.push({ stage: "Concept + outline", usd: conceptOutline + outlineUsd });

  const planUsd = calculateUsd(m.planner, { inputTokens: 2_500, outputTokens: 700 });
  const draftUsd = calculateUsd(m.prose, {
    inputTokens: chapterInputTokens,
    outputTokens: chapterOutputTokens,
    cachedInputTokens: chapterInputTokens * cachedShare,
  });
  stages.push({ stage: "Chapter drafting", usd: (planUsd + draftUsd) * chapters });

  if (tier !== "draft") {
    const critiqueUsd = calculateUsd(m.critic, {
      inputTokens: chapterOutputTokens + 1_500,
      outputTokens: 900,
    });
    const reviseShare = 0.45;
    const reviseUsd = calculateUsd(m.prose, {
      inputTokens: chapterOutputTokens + 1_200,
      outputTokens: chapterOutputTokens * 0.25,
    });
    stages.push({
      stage: "Critique + revisions",
      usd: (critiqueUsd + reviseUsd * reviseShare) * chapters,
    });

    const editShare = tier === "premium" ? 1 : 0.3;
    const editUsd = calculateUsd(m.editor, {
      inputTokens: chapterOutputTokens + 2_000,
      outputTokens: chapterOutputTokens * 0.3,
    });
    stages.push({ stage: "Editorial pass", usd: editUsd * chapters * editShare });
  }

  const summaryUsd = calculateUsd(m.summarizer, {
    inputTokens: chapterOutputTokens,
    outputTokens: 400,
  });
  stages.push({ stage: "Summaries + character bible", usd: summaryUsd * chapters });

  const continuityCalls = tier === "draft" ? 1 : 6;
  const continuityUsd = calculateUsd(m.continuity, {
    inputTokens: 350 * chapters + 2_500,
    outputTokens: 1_200,
  });
  stages.push({ stage: "Continuity review", usd: continuityUsd * continuityCalls });

  const totalUsd = stages.reduce((acc, s) => acc + s.usd, 0);
  const parallelWaves = Math.ceil(chapters / 4);
  const estimatedMinutes = Math.round(4 + parallelWaves * (tier === "premium" ? 5 : 3));

  return {
    tier,
    chapters,
    wordsPerChapter,
    totalUsd: Math.round(totalUsd * 100) / 100,
    stages: stages.map((s) => ({ ...s, usd: Math.round(s.usd * 100) / 100 })),
    estimatedMinutes,
  };
}

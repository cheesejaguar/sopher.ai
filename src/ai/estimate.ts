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
  // Calibrated 2026-07-27 against llm_calls from a real 12x3,000-word run:
  // draft inputs ~9.5k with ~50% served from cache (system prefix + outline
  // slice + summaries + tool results).
  const chapterInputTokens = 9_500;
  const cachedShare = 0.5;

  const stages: StageEstimate[] = [];

  const conceptOutline = calculateUsd(m.concept, { inputTokens: 12_000, outputTokens: 6_000 });
  const outlineUsd = calculateUsd(m.outline, {
    inputTokens: 8_000,
    outputTokens: 700 * chapters,
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
    inputTokens: chapterOutputTokens + 1_500,
    outputTokens: 1_200,
  });
  stages.push({ stage: "Summaries + character bible", usd: summaryUsd * chapters });

  const continuityCalls = tier === "draft" ? 1 : 6;
  // Each phase re-reads the summary corpus and spot-checks prose via tools.
  const continuityInput = 20_000 + 350 * chapters;
  const continuityUsd = calculateUsd(m.continuity, {
    inputTokens: continuityInput,
    outputTokens: 2_000,
    cachedInputTokens: continuityInput * cachedShare,
  });
  stages.push({ stage: "Continuity review", usd: continuityUsd * continuityCalls });

  const totalUsd = stages.reduce((acc, s) => acc + s.usd, 0);
  const parallelWaves = Math.ceil(chapters / 4);
  const estimatedMinutes = Math.round(10 + parallelWaves * (tier === "premium" ? 10 : 8));

  return {
    tier,
    chapters,
    wordsPerChapter,
    totalUsd: Math.round(totalUsd * 100) / 100,
    stages: stages.map((s) => ({ ...s, usd: Math.round(s.usd * 100) / 100 })),
    estimatedMinutes,
  };
}

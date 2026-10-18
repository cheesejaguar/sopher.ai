import { MODELS, PROSE_FALLBACK_MODELS, type QualityTier } from "./models";
import { calculateUsd } from "@/lib/billing/pricing";

const TOKENS_PER_WORD = 1.35;

function costliestAllowedProseUsd(
  primaryModel: string,
  usage: Parameters<typeof calculateUsd>[1],
): number {
  return Math.max(
    ...[primaryModel, ...PROSE_FALLBACK_MODELS].map((model) => calculateUsd(model, usage)),
  );
}

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
  // writer.draft recalibrated 2026-10-06 from llm_calls on Sonnet 5.5 (three
  // clean 1,000-1,300-word chapters). The draft is a three-step tool loop and
  // every step resends the book context, so a chapter reads ~38k input
  // tokens, ~78% of them written to the prompt cache and ~22% read from it;
  // the 2026-07 figure (9.5k input, half cached, no cache writes) quoted about
  // a third of the real cost. Sonnet 5.5 cannot disable thinking, so output
  // runs ~2.2 tokens per prose word rather than TOKENS_PER_WORD.
  const draftInputTokens = 34_000 + 3 * chapterOutputTokens;
  const draftUsage = {
    inputTokens: draftInputTokens,
    cacheWriteTokens: Math.round(draftInputTokens * 0.78),
    cachedInputTokens: Math.round(draftInputTokens * 0.22),
    outputTokens: wordsPerChapter * 2.2,
  };

  const stages: StageEstimate[] = [];

  const conceptOutline = calculateUsd(m.concept, { inputTokens: 12_000, outputTokens: 6_000 });
  const outlineUsd = calculateUsd(m.outline, {
    inputTokens: 8_000,
    outputTokens: 700 * chapters,
  });
  stages.push({ stage: "Concept + outline", usd: conceptOutline + outlineUsd });

  const planUsd = calculateUsd(m.planner, { inputTokens: 2_500, outputTokens: 700 });
  // A fallback is still real provider spend. Authorize the most expensive
  // allowed model rather than assuming the requested primary handled it.
  const draftUsd = costliestAllowedProseUsd(m.prose, draftUsage);
  stages.push({ stage: "Chapter drafting", usd: (planUsd + draftUsd) * chapters });

  if (tier !== "draft") {
    const critiqueUsd = calculateUsd(m.critic, {
      inputTokens: chapterOutputTokens + 1_500,
      outputTokens: 900,
    });
    const reviseShare = 0.45;
    const reviseUsd = costliestAllowedProseUsd(m.prose, {
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
  // One story-bible pass per book: ~5k in, ~20k out (llm_calls, 2026-08..10).
  const bibleUsd = calculateUsd(m.summarizer, { inputTokens: 5_500, outputTokens: 20_000 });
  stages.push({
    stage: "Summaries + character bible",
    usd: summaryUsd * chapters + bibleUsd,
  });

  const continuityCalls = tier === "draft" ? 1 : 6;
  // Each phase re-reads the summary corpus and spot-checks prose via tools.
  const continuityInput = 20_000 + 350 * chapters;
  const continuityUsd = calculateUsd(m.continuity, {
    inputTokens: continuityInput,
    outputTokens: 2_000,
    // Unchanged 2026-07 assumption; not yet re-measured on 5.5.
    cachedInputTokens: continuityInput * 0.5,
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

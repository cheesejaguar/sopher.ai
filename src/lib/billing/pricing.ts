// USD per million tokens, sourced from the AI Gateway model list
// (https://ai-gateway.vercel.sh/v1/models). Reconcile when models change —
// llm_calls rows are operational metering; the Gateway dashboard is billing truth.
export type ModelPricing = {
  inputPerMTok: number;
  outputPerMTok: number;
  cachedInputPerMTok: number;
  cacheWritePerMTok: number;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "anthropic/claude-haiku-4.5": {
    inputPerMTok: 1,
    outputPerMTok: 5,
    cachedInputPerMTok: 0.1,
    cacheWritePerMTok: 1.25,
  },
  "anthropic/claude-sonnet-5": {
    inputPerMTok: 2,
    outputPerMTok: 10,
    cachedInputPerMTok: 0.2,
    cacheWritePerMTok: 2.5,
  },
  "anthropic/claude-sonnet-4.6": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cachedInputPerMTok: 0.3,
    cacheWritePerMTok: 3.75,
  },
  "anthropic/claude-opus-5": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cachedInputPerMTok: 0.5,
    cacheWritePerMTok: 6.25,
  },
  "google/gemini-3.1-flash-image": {
    inputPerMTok: 0.5,
    outputPerMTok: 3,
    cachedInputPerMTok: 0.05,
    cacheWritePerMTok: 0.5,
  },
};

const FALLBACK_PRICING: ModelPricing = {
  inputPerMTok: 5,
  outputPerMTok: 25,
  cachedInputPerMTok: 0.5,
  cacheWritePerMTok: 6.25,
};

export type UsageTokens = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
};

export function calculateUsd(model: string, usage: UsageTokens): number {
  const pricing = MODEL_PRICING[model] ?? FALLBACK_PRICING;
  const cachedRead = usage.cachedInputTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const uncachedInput = Math.max(0, usage.inputTokens - cachedRead - cacheWrite);
  const usd =
    (uncachedInput * pricing.inputPerMTok +
      cachedRead * pricing.cachedInputPerMTok +
      cacheWrite * pricing.cacheWritePerMTok +
      usage.outputTokens * pricing.outputPerMTok) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

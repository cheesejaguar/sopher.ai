// The only place gateway model slugs live. Verify against
// https://ai-gateway.vercel.sh/v1/models when changing models.
export type QualityTier = "draft" | "standard" | "premium";

export type TierModels = {
  planner: string;
  prose: string;
  critic: string;
  editor: string;
  summarizer: string;
  continuity: string;
  concept: string;
  outline: string;
  lineEdit: string;
  image: string;
};

const HAIKU = "anthropic/claude-haiku-4.5";
const SONNET = "anthropic/claude-sonnet-5.5";
const OPUS = "anthropic/claude-opus-5.5";
const IMAGE = "google/gemini-3.1-flash-image";

export const MODELS: Record<QualityTier, TierModels> = {
  draft: {
    planner: HAIKU,
    prose: SONNET,
    critic: HAIKU,
    editor: SONNET,
    summarizer: HAIKU,
    continuity: SONNET,
    concept: SONNET,
    outline: SONNET,
    lineEdit: HAIKU,
    image: IMAGE,
  },
  standard: {
    planner: HAIKU,
    prose: SONNET,
    critic: SONNET,
    editor: SONNET,
    summarizer: HAIKU,
    continuity: SONNET,
    concept: SONNET,
    outline: SONNET,
    lineEdit: HAIKU,
    image: IMAGE,
  },
  premium: {
    planner: SONNET,
    prose: OPUS,
    critic: SONNET,
    editor: SONNET,
    summarizer: HAIKU,
    continuity: SONNET,
    concept: SONNET,
    outline: SONNET,
    lineEdit: HAIKU,
    image: IMAGE,
  },
};

// Gateway-side fallback chain for prose calls (provider hiccups, not quality
// tiers). Same price as the primary Sonnet, so it never raises a hold ceiling.
export const PROSE_FALLBACK_MODELS = ["anthropic/claude-sonnet-5"];

/**
 * How each model's reasoning is kept to a minimum. Our output ceilings and
 * estimates are sized for author-facing prose and JSON, so implicit thinking
 * would otherwise spend the allowance before any deliverable is produced.
 * Verified live through the Gateway on 2026-10-06:
 *
 * - Haiku 4.5 and Sonnet 5 accept `thinking: disabled`; Haiku rejects `effort`,
 *   and Sonnet 5 rejects `between_tools`.
 * - Sonnet 5.5 cannot disable thinking; `between_tools` is its off switch (the
 *   Gateway maps `disabled` to it, with a warning).
 * - Opus 5.5 always thinks adaptively; `effort` is the only control, and the
 *   Gateway strips a `thinking` setting with a warning.
 */
type ReasoningControl = {
  /** The thinking setting that turns reasoning off, or null if it cannot be. */
  off: "disabled" | "between_tools" | null;
  /** Accepts `effort`; required to bound models whose thinking cannot be off. */
  effort: boolean;
};

const REASONING: Record<string, ReasoningControl> = {
  [HAIKU]: { off: "disabled", effort: false },
  "anthropic/claude-sonnet-5": { off: "disabled", effort: true },
  [SONNET]: { off: "between_tools", effort: true },
  [OPUS]: { off: null, effort: true },
};

const DEFAULT_REASONING: ReasoningControl = { off: "disabled", effort: false };

/**
 * Anthropic provider options that minimise reasoning for a call routed to
 * `primary` and, on a provider hiccup, to each of `fallbacks`. One options
 * object reaches every model in the chain, so it must be one they all accept.
 */
export function anthropicReasoningOptions(
  primary: string,
  fallbacks: readonly string[] = [],
): { thinking?: { type: "disabled" | "between_tools" }; effort?: "low" } {
  const chain = [primary, ...fallbacks].map((model) => REASONING[model] ?? DEFAULT_REASONING);
  const offModes = new Set(chain.map((control) => control.off).filter((off) => off !== null));
  // A single shared off switch is sent as-is; a mixed chain falls back to
  // `disabled`, which every model accepts (5.5 models translate or drop it).
  const off = offModes.size === 0 ? null : offModes.size === 1 ? [...offModes][0] : "disabled";
  const needsEffort = chain.some((control) => control.off === null);
  return {
    ...(off ? { thinking: { type: off } } : {}),
    ...(needsEffort && chain.every((control) => control.effort) ? { effort: "low" as const } : {}),
  };
}

/** Canonical tier order, cheapest first. Both the API and the wizard read this. */
export const QUALITY_TIERS: readonly QualityTier[] = ["draft", "standard", "premium"];

export const TIER_LABELS: Record<QualityTier, { name: string; blurb: string }> = {
  draft: { name: "Draft", blurb: "Fast single-pass draft with heuristic quality checks" },
  standard: { name: "Standard", blurb: "Drafted, critiqued, and selectively edited" },
  premium: { name: "Premium", blurb: "Our best prose model plus a full editorial pass" },
};

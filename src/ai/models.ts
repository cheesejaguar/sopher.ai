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

// TODO(credits): restore to "anthropic/claude-haiku-4.5" once AI Gateway
// credits are added — the gateway's free-credit tier blocks haiku today, and
// sonnet-5 is the cheapest unblocked model.
const HAIKU = "anthropic/claude-sonnet-5";
const SONNET = "anthropic/claude-sonnet-5";
const OPUS = "anthropic/claude-opus-5";
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

// Gateway-side fallback chain for prose calls (provider hiccups, not quality tiers).
export const PROSE_FALLBACK_MODELS = ["anthropic/claude-sonnet-4.6"];

export const TIER_LABELS: Record<QualityTier, { name: string; blurb: string }> = {
  draft: { name: "Draft", blurb: "Fast single-pass draft with heuristic quality checks" },
  standard: { name: "Standard", blurb: "Drafted, critiqued, and selectively edited" },
  premium: { name: "Premium", blurb: "Our best prose model plus a full editorial pass" },
};

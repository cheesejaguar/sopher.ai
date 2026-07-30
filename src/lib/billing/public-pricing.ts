/**
 * Public, illustrative pricing facts shared by visible pages, metadata,
 * structured copy, guides, and llms.txt. These are not runtime estimates:
 * every author still receives a project-specific quote before work begins.
 */
export const PUBLIC_BOOK_WORDS = 36_000;

export const PUBLIC_TIER_COSTS = {
  draft: {
    id: "draft",
    tier: "Draft",
    credits: 21,
    blurb: "fast single pass",
  },
  standard: {
    id: "standard",
    tier: "Standard",
    credits: 27,
    blurb: "critiqued and edited",
  },
  premium: {
    id: "premium",
    tier: "Premium",
    credits: 36,
    blurb: "best prose model, deep edit",
  },
} as const;

export const PUBLIC_TIER_COST_ROWS = Object.values(PUBLIC_TIER_COSTS);
export const PUBLIC_BOOK_COST_MIN = PUBLIC_TIER_COSTS.draft.credits;
export const PUBLIC_BOOK_COST_MAX = PUBLIC_TIER_COSTS.premium.credits;
export const PUBLIC_BOOK_COST_RANGE = `${PUBLIC_BOOK_COST_MIN}\u2013${PUBLIC_BOOK_COST_MAX}`;

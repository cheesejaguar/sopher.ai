/**
 * Client-safe credit constants and pure helpers. The wallet itself (DB reads
 * and writes) lives in ./credits, which must never reach a client bundle.
 */

export const CREDIT_MARKUP = 2.75;

/**
 * How far a balance may go negative before metered calls refuse outright. The
 * product intentionally lets a wave in flight finish when the balance empties;
 * this bounds that overshoot.
 */
export const CREDIT_FLOOR = -50;

export type CreditPack = {
  id: string;
  name: string;
  usd: number;
  credits: number;
  /** Bonus share, for display only — `credits` is already inclusive. */
  bonus: number;
};

export const CREDIT_PACKS: CreditPack[] = [
  { id: "starter", name: "Starter", usd: 25, credits: 25, bonus: 0 },
  { id: "author", name: "Author", usd: 60, credits: 66, bonus: 0.1 },
  { id: "studio", name: "Studio", usd: 120, credits: 138, bonus: 0.15 },
  { id: "press", name: "Press", usd: 300, credits: 360, bonus: 0.2 },
];

export function getPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

/** Retail credits for a metered dollar amount. */
export function creditsForUsd(usd: number): number {
  return usd * CREDIT_MARKUP;
}

/** New-user welcome grant, in credits. Enough to watch a real book begin. */
export const SIGNUP_GRANT_CREDITS = 10;

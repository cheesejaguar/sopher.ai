/** Number formatting for cost surfaces — mono/tabular contexts. */

export function formatUsd(usd: number): string {
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 1234 → "1,234"; 1_240_000 → "1.24M" — keeps token columns scannable. */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 10_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return tokens.toLocaleString("en-US");
}

/** "12.4 cr" — credits are the user-facing currency; USD is the metered detail. */
export function formatCredits(credits: number): string {
  return `${credits.toFixed(credits >= 100 ? 0 : 1)} cr`;
}

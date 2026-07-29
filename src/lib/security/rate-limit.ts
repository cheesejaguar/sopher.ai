import "server-only";

import { checkRateLimit } from "@vercel/firewall";

/**
 * Per-user rate limiting for the routes that cost money.
 *
 * Every guarded route already pre-checks the caller's balance, but a balance
 * check is a read: N concurrent requests all see the same number and all pass.
 * The floor backstop (CREDIT_FLOOR) then catches the overshoot only after the
 * calls have been issued and paid for. Rate limiting is what bounds the
 * overshoot; the floor is what bounds the loss.
 *
 * Each LIMIT id needs a matching WAF custom rule in the Vercel dashboard
 * (Firewall → custom rule → condition `@vercel/firewall`, set Rate limit ID,
 * publish). Until that rule exists the check simply reports "not limited" —
 * which is why this fails open by design, see below.
 */

export const LIMITS = {
  /** Selection edits, chapter review, chapter regeneration. */
  llmEdit: "llm-edit",
  /** Content tools (mermaid, illustration). */
  llmTool: "llm-tool",
  /** Cover and character portrait generation. */
  imageGen: "image-gen",
  /** Stripe Checkout session creation. */
  checkout: "checkout",
  /** Starting or restarting a full book run. */
  bookStart: "book-start",
  /** The one unauthenticated route — keyed by IP, not user. */
  estimates: "estimates",
} as const;

export type LimitId = (typeof LIMITS)[keyof typeof LIMITS];

/**
 * Dev has no WAF in front of it, so `checkRateLimit` would either error or
 * always allow. Skipping explicitly keeps `pnpm dev` and the e2e suite honest
 * about what they are actually exercising.
 */
const enabled = process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== undefined;

export type RateLimitResult = { limited: false } | { limited: true; response: Response };

/**
 * Returns `{ limited: true, response }` when the caller should be turned away.
 *
 * Fails open. A firewall outage must not take down paid generation for
 * everyone — the failure mode of a closed fail here is "nobody can write their
 * book", which is worse than the failure mode of an open one ("a determined
 * caller briefly exceeds a quota they are still being billed for").
 */
export async function rateLimit(
  id: LimitId,
  req: Request,
  key: string | undefined,
): Promise<RateLimitResult> {
  if (!(await isLimited(id, key, req))) return { limited: false };
  return {
    limited: true,
    response: Response.json(
      { error: "Too many requests — give it a moment and try again." },
      { status: 429, headers: { "Retry-After": "60" } },
    ),
  };
}

/**
 * Server-action form. `checkRateLimit` takes the request optionally and falls
 * back to the ambient request context, which is what a server action has.
 * Returns a plain boolean because actions return data, not Responses.
 */
export async function isActionRateLimited(id: LimitId, key: string): Promise<boolean> {
  return isLimited(id, key, undefined);
}

async function isLimited(
  id: LimitId,
  key: string | undefined,
  req: Request | undefined,
): Promise<boolean> {
  if (!enabled) return false;
  try {
    const { rateLimited, error } = await checkRateLimit(id, {
      ...(req ? { request: req } : {}),
      // Undefined falls back to the request IP, which is what we want for the
      // one anonymous route.
      rateLimitKey: key,
    });
    // "not-found" means the WAF rule for this id has not been created and
    // published yet. Allow, but say so — a silently absent limit reads exactly
    // like a working one.
    if (error === "not-found") {
      console.warn(`[rate-limit] no WAF rule published for "${id}" — not limiting`);
      return false;
    }
    return rateLimited;
  } catch (error) {
    console.warn(`[rate-limit] ${id} check failed, allowing:`, error);
    return false;
  }
}

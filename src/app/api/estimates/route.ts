import { estimateBookCost } from "@/ai/estimate";
import { requireUser } from "@/lib/auth";
import { creditsForUsd, getBalance } from "@/lib/billing/credits";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { estimateRequestSchema } from "@/lib/validation/project";

export const maxDuration = 15;

/**
 * Pre-generation estimate. Credits are what the wallet will actually be
 * debited (metered USD x markup) — quoting metered dollars alone understated
 * the real cost 2.75x, which is how the old display misled.
 *
 * The one route open to anonymous callers (the pricing page quotes before
 * sign-in), so it is rate limited by IP rather than by user.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(LIMITS.estimates, req, undefined);
  if (limited.limited) return limited.response;

  // Unparseable bodies threw out of the handler here, surfacing as a 500 with a
  // stack rather than the 400 every other route returns.
  const parsed = estimateRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { tier, chapters, wordsPerChapter } = parsed.data;
  const estimate = estimateBookCost(tier, chapters, wordsPerChapter);

  // Best-effort: the quote itself is pure computation and must stay usable
  // when auth or the database is unavailable (signed-out visitors, CI without
  // a DATABASE_URL). Balance context is a nicety, never a dependency.
  let balance: number | null = null;
  try {
    const { userId } = await requireUser();
    balance = await getBalance(userId);
  } catch {
    balance = null;
  }

  return Response.json({
    ...estimate,
    credits: creditsForUsd(estimate.totalUsd),
    balance,
  });
}

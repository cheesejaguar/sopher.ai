import { estimateBookCost } from "@/ai/estimate";
import { QUALITY_TIERS } from "@/ai/models";
import { requireUser } from "@/lib/auth";
import { creditsForUsd, getBalance } from "@/lib/billing/credits";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { estimateRequestSchema } from "@/lib/validation/project";

export const maxDuration = 15;

/**
 * Pre-generation estimate — every tier in one response.
 *
 * It used to quote a single tier, so the wizard fired three parallel requests
 * per adjustment, one per tier. Each did its own balance query, and the balance
 * does not vary by tier, so two of the three were computing the same sum. One
 * slider nudge cost three rate-limit checks, three database round trips, and
 * three cold-start-eligible invocations to fill one screen.
 *
 * Credits are what the wallet will actually be debited (metered USD x markup);
 * quoting metered dollars alone understated the real cost 2.75x, which is how
 * the old display misled.
 */
export async function POST(req: Request) {
  // IP-keyed, not user-keyed: the balance lookup below is best-effort by
  // design (see comment there), so an authenticated userId is not guaranteed
  // to exist here.
  const limited = await rateLimit(LIMITS.estimates, req, undefined);
  if (limited.limited) return limited.response;

  // Unparseable bodies threw out of the handler here, surfacing as a 500 with a
  // stack rather than the 400 every other route returns.
  const parsed = estimateRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { chapters, wordsPerChapter } = parsed.data;

  // Best-effort, and load-bearing: the quote itself is pure computation and must
  // stay usable when auth or the database is unavailable. The DB-free e2e suite
  // CI runs depends on this — see e2e/wizard.spec.ts. Balance context is a
  // nicety, never a dependency.
  let balance: number | null = null;
  try {
    const { userId } = await requireUser();
    balance = await getBalance(userId);
  } catch {
    balance = null;
  }

  const tiers = QUALITY_TIERS.map((tier) => {
    const estimate = estimateBookCost(tier, chapters, wordsPerChapter);
    return { ...estimate, credits: creditsForUsd(estimate.totalUsd), balance };
  });

  return Response.json({ balance, tiers });
}

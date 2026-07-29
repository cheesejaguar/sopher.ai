import { estimateBookCost } from "@/ai/estimate";
import { requireUser } from "@/lib/auth";
import { creditsForUsd, getBalance } from "@/lib/billing/credits";
import { estimateRequestSchema } from "@/lib/validation/project";

/**
 * Pre-generation estimate. Credits are what the wallet will actually be
 * debited (metered USD x markup) — quoting metered dollars alone understated
 * the real cost 2.75x, which is how the old display misled.
 */
export async function POST(req: Request) {
  const parsed = estimateRequestSchema.safeParse(await req.json());
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

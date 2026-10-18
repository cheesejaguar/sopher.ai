/**
 * Refunds the over-debit from streamed model ids priced at fallback rates,
 * optionally with a goodwill bonus.
 *
 * From 2026-07-31 until the fix in PR #189, streamed Gateway responses
 * reported the provider's model id ("claude-sonnet-5") rather than the slug
 * requested ("anthropic/claude-sonnet-5"). The id missed MODEL_PRICING, so
 * those calls were billed at FALLBACK_PRICING. This recomputes every such
 * llm_calls row at its model's real rates and credits each author the
 * difference (rounded up in the author's favour).
 *
 *   pnpm exec dotenv -e .env.local -- pnpm exec tsx --tsconfig scripts/tsconfig.json \
 *     scripts/refund-streamed-model-overcharge.ts [--apply] [--bonus N] [--email ADDRESS]
 *
 * --email limits it to one author. Without --apply it prints what it would do
 * and writes nothing. Both ledger
 * rows carry a fixed external_ref per author, so re-running never pays twice.
 */
import { sql } from "drizzle-orm";

import { getDb } from "../src/db";
import { grantCredits } from "../src/lib/billing/credits";
import { CREDIT_MARKUP } from "../src/lib/billing/credits-shared";
import { calculateUsd, canonicalModelId } from "../src/lib/billing/pricing";

/** The shared local dev identity: test spend, not a customer. */
const EXCLUDED_USERS = new Set(["dev-user"]);
const REFUND_REF = "refund:streamed-model-pricing:2026-10";
const BONUS_REF = "grant:streamed-model-pricing-bonus:2026-10";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : (process.argv[index + 1] ?? "");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const bonus = Number(flag("--bonus") ?? 0);
  const onlyEmail = flag("--email")?.toLowerCase();
  if (!Number.isFinite(bonus) || bonus < 0 || bonus > 50) {
    throw new Error("--bonus must be a number of credits between 0 and 50");
  }

  const { rows } = await getDb().execute<{
    user_id: string;
    email: string | null;
    model: string;
    input_tokens: string;
    output_tokens: string;
    cached_input_tokens: string;
    cache_write_tokens: string;
    usd: string;
  }>(sql`
    select c.user_id, u.email, c.model, c.input_tokens, c.output_tokens,
           c.cached_input_tokens, c.cache_write_tokens, c.usd
    from llm_calls c left join users u on u.id = c.user_id
    where c.model not like '%/%'
  `);

  const byUser = new Map<string, { email: string | null; calls: number; overUsd: number }>();
  for (const row of rows) {
    if (EXCLUDED_USERS.has(row.user_id)) continue;
    if (onlyEmail && row.email?.toLowerCase() !== onlyEmail) continue;
    const correct = calculateUsd(canonicalModelId(row.model), {
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      cachedInputTokens: Number(row.cached_input_tokens),
      cacheWriteTokens: Number(row.cache_write_tokens),
    });
    const entry = byUser.get(row.user_id) ?? { email: row.email, calls: 0, overUsd: 0 };
    entry.calls += 1;
    entry.overUsd += Math.max(0, Number(row.usd) - correct);
    byUser.set(row.user_id, entry);
  }

  let totalRefund = 0;
  for (const [userId, entry] of byUser) {
    const refund = Math.ceil(entry.overUsd * CREDIT_MARKUP * 10_000) / 10_000;
    if (refund <= 0) continue;
    totalRefund += refund;
    console.log(
      `${entry.email ?? userId}: ${entry.calls} calls, refund ${refund.toFixed(4)} cr` +
        (bonus > 0 ? ` + bonus ${bonus} cr` : ""),
    );
    if (!apply) continue;
    const refunded = await grantCredits({
      userId,
      credits: refund,
      kind: "refund",
      description: "Refund: chapter drafts were over-billed by a pricing error",
      externalRef: `${REFUND_REF}:${userId}`,
    });
    const granted =
      bonus > 0 &&
      (await grantCredits({
        userId,
        credits: bonus,
        kind: "grant",
        description: "Thank you: bonus credits for the pricing error",
        externalRef: `${BONUS_REF}:${userId}`,
      }));
    console.log(
      `  refund ${refunded ? "written" : "already present"}` +
        (bonus > 0 ? `, bonus ${granted ? "written" : "already present"}` : ""),
    );
  }
  console.log(
    `${byUser.size} author(s); refunds ${totalRefund.toFixed(4)} cr` +
      (bonus > 0 ? `; bonuses ${(bonus * byUser.size).toFixed(0)} cr` : "") +
      (apply ? "" : " (dry run: pass --apply to write)"),
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);

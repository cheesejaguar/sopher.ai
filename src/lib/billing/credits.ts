import { eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";

export * from "./credits-shared";
import { CREDIT_FLOOR, creditsForUsd } from "./credits-shared";

/**
 * Prepaid credit wallet.
 *
 * One credit is one dollar of retail value. Work is debited at `CREDIT_MARKUP`
 * times its metered LLM cost — a multiplier rather than a fixed per-book price,
 * so margin holds when provider rates move and heavy editing is paid for by the
 * author who asks for it rather than absorbed.
 *
 * The markup is calibrated against production data: two complete books measured
 * $6.39 and $8.61 to generate, and roughly 50% more to finish with light
 * editing. See doc/PRICING.md.
 */

export class InsufficientCreditsError extends Error {
  constructor(
    readonly balance: number,
    readonly required: number,
  ) {
    super(`Insufficient credits: ${balance.toFixed(2)} available, ${required.toFixed(2)} required`);
    this.name = "InsufficientCreditsError";
  }
}

/**
 * Current balance — always derived from the ledger, never read from a stored
 * column. Summing is cheap at this scale and cannot drift.
 */
export async function getBalance(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ balance: sql<string>`coalesce(sum(${schema.creditLedger.amount}), 0)` })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.userId, userId));
  return Number(row?.balance ?? 0);
}

/**
 * Grants credits for a completed payment.
 *
 * `externalRef` carries a unique index, so a Stripe webhook retry hits a
 * constraint violation rather than granting twice. Returns false when the entry
 * already existed — the caller should treat that as success, not an error.
 */
export async function grantCredits(input: {
  userId: string;
  credits: number;
  description: string;
  externalRef: string;
  kind?: "purchase" | "refund" | "grant";
}): Promise<boolean> {
  const inserted = await getDb()
    .insert(schema.creditLedger)
    .values({
      userId: input.userId,
      amount: String(input.credits),
      kind: input.kind ?? "purchase",
      description: input.description,
      externalRef: input.externalRef,
    })
    .onConflictDoNothing({ target: schema.creditLedger.externalRef })
    .returning({ id: schema.creditLedger.id });
  return inserted.length > 0;
}

/**
 * Debits credits for metered work. Called after the work happens, from the same
 * place that records the `llm_calls` row, so the ledger and the cost record
 * cannot disagree.
 */
export async function debitCredits(input: {
  userId: string;
  meteredUsd: number;
  description: string;
  projectId?: string;
  runId?: string;
}): Promise<void> {
  const credits = creditsForUsd(input.meteredUsd);
  if (credits <= 0) return;
  await getDb()
    .insert(schema.creditLedger)
    .values({
      userId: input.userId,
      amount: String(-credits),
      kind: "usage",
      description: input.description,
      projectId: input.projectId,
      runId: input.runId,
      meteredUsd: String(input.meteredUsd),
    });
}

/** Throws when the balance would not cover `requiredCredits`. */
export async function assertCredits(userId: string, requiredCredits: number): Promise<void> {
  const balance = await getBalance(userId);
  if (balance < requiredCredits) {
    throw new InsufficientCreditsError(balance, requiredCredits);
  }
}

/** Route-level gate: covers a metered-USD estimate at retail markup. */
export async function assertCreditsForUsd(userId: string, estimateUsd: number): Promise<void> {
  await assertCredits(userId, creditsForUsd(estimateUsd));
}

/** Hard backstop for in-flight work: refuses once the floor is breached. */
export async function assertAboveFloor(userId: string): Promise<void> {
  const balance = await getBalance(userId);
  if (balance <= CREDIT_FLOOR) {
    throw new InsufficientCreditsError(balance, 0);
  }
}

/** Recent movements for the wallet UI. */
export async function listLedger(userId: string, limit = 50) {
  return getDb()
    .select({
      id: schema.creditLedger.id,
      amount: schema.creditLedger.amount,
      kind: schema.creditLedger.kind,
      description: schema.creditLedger.description,
      createdAt: schema.creditLedger.createdAt,
    })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.userId, userId))
    .orderBy(sql`${schema.creditLedger.createdAt} desc`)
    .limit(limit);
}

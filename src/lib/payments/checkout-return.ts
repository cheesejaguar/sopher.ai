import "server-only";

import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";

const checkoutSessionIdSchema = z
  .string()
  .min(8)
  .max(255)
  .regex(/^cs_[A-Za-z0-9_]+$/);

/**
 * Returns the Checkout Session id only when it has Stripe's bounded object-id
 * shape. This keeps arbitrary query strings out of the ledger lookup.
 */
export function checkoutSessionId(value: string | undefined): string | null {
  const parsed = checkoutSessionIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The signed Stripe webhook writes one idempotent purchase row keyed by the
 * Checkout Session id. Requiring both that id and the signed-in owner makes
 * this row the settlement proof for the browser return.
 */
export async function hasOwnedSettledCheckout(input: {
  userId: string;
  sessionId: string | null;
}): Promise<boolean> {
  if (!input.sessionId) return false;

  const rows = await getDb()
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, input.userId),
        eq(schema.creditLedger.externalRef, input.sessionId),
        eq(schema.creditLedger.kind, "purchase"),
        gt(schema.creditLedger.amount, "0"),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

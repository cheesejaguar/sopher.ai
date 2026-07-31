import { sql } from "drizzle-orm";

import { creditLedger } from "@/db/schema";

/**
 * Author-facing credits consumed by a run. Provider usage remains in the
 * ledger for auditability, while delivery refunds cancel the corresponding
 * charge in the number shown to the author.
 */
export function netRunCreditsUsedSql() {
  return sql<string>`coalesce(
    -sum(${creditLedger.amount}) filter (
      where ${creditLedger.kind} = 'usage'
        and not exists (
          select 1
          from credit_ledger compensated
          where compensated.user_id = credit_ledger.user_id
            and compensated.kind = 'adjustment'
            and compensated.amount > 0
            and compensated.external_ref =
              'delivery-refund:' ||
              regexp_replace(credit_ledger.external_ref, ':step:[0-9]+$', '')
        )
    ),
    0
  )`;
}

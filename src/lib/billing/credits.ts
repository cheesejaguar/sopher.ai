import { and, eq, sql } from "drizzle-orm";

import { getDb, getSqlClient, schema } from "@/db";

export * from "./credits-shared";
import { canonicalizeCreditRequirement, CREDIT_FLOOR, creditsForUsd } from "./credits-shared";

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

const INTERACTIVE_RESERVATION_TTL = "1 hour";
export const TERMINAL_RESERVATION_GRACE = "1 hour";

/**
 * Reconciles reservations whose owner can no longer settle them.
 *
 * Generation holds become releasable once their run is terminal. The legacy
 * interactive-reservation format retains its conservative expiry, but current
 * metering-claim intents never expire: an ambiguous provider result requires
 * Gateway verification through the admin reconciliation queue. Settlement and
 * reconciliation acquire the wallet advisory lock in a prior transaction
 * statement so their reads observe the latest committed wallet state.
 */
export async function reconcileCreditReservations(userId: string): Promise<number> {
  const client = getSqlClient();
  const [, result] = await client.transaction((tx) => [
    tx`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
    tx`
    with candidates as materialized (
      select
        reservation.external_ref,
        reservation.project_id,
        reservation.run_id,
        greatest(
          0,
          -reservation.amount - coalesce((
            select sum(claimed.amount)
            from credit_ledger claimed
            where claimed.user_id = ${userId}
              and claimed.external_ref like
                ('reservation-claim-release:' || reservation.external_ref || ':%')
          ), 0)
        ) as remaining
      from credit_ledger reservation
      left join generation_runs run on run.id = reservation.run_id
      where reservation.user_id = ${userId}
        and reservation.kind = 'adjustment'
        and reservation.amount < 0
        and reservation.external_ref is not null
        and (
          (
            reservation.external_ref like 'interactive-reservation:%'
            and reservation.created_at <= now() - ${INTERACTIVE_RESERVATION_TTL}::interval
            and not exists (
              select 1
              from credit_ledger pending_intent
              where pending_intent.user_id = ${userId}
                and pending_intent.external_ref like
                  ('metering-intent:' || reservation.external_ref || ':%')
                and not exists (
                  select 1
                  from credit_ledger terminal_intent
                  where terminal_intent.external_ref in (
                    'intent-settled:' || pending_intent.external_ref,
                    'intent-aborted:' || pending_intent.external_ref
                  )
                )
            )
          )
          or (
            reservation.external_ref like 'generation-reservation:%'
            and
            run.status in ('completed', 'failed', 'cancelled')
            and run.completed_at <= now() - ${TERMINAL_RESERVATION_GRACE}::interval
          )
        )
        and not exists (
          select 1
          from credit_ledger released
          where released.external_ref = 'release:' || reservation.external_ref
        )
    ),
    inserted as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${userId},
        candidates.remaining,
        'adjustment',
        'Reconcile expired credit reservation',
        candidates.project_id,
        candidates.run_id,
        'release:' || candidates.external_ref
      from candidates
      on conflict (external_ref) do nothing
      returning id
    )
    select count(*)::int as released from inserted
  `,
  ]);
  return (result as Array<{ released: number }>)[0]?.released ?? 0;
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
  kind?: "purchase" | "refund" | "grant" | "adjustment";
  /**
   * Dollars actually charged. Purchases and refunds only — credits are not
   * dollars once bonus tiers exist, and this is the figure that reconciles
   * with Stripe.
   */
  usdPaid?: number;
}): Promise<boolean> {
  const inserted = await getDb()
    .insert(schema.creditLedger)
    .values({
      userId: input.userId,
      amount: String(input.credits),
      kind: input.kind ?? "purchase",
      description: input.description,
      externalRef: input.externalRef,
      usdPaid: input.usdPaid === undefined ? null : String(input.usdPaid),
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
  /** Stable logical-call key. Repeated infrastructure attempts debit once. */
  externalRef?: string;
}): Promise<boolean> {
  const credits = creditsForUsd(input.meteredUsd);
  if (credits <= 0) return false;
  const insert = getDb()
    .insert(schema.creditLedger)
    .values({
      userId: input.userId,
      amount: String(-credits),
      kind: "usage",
      description: input.description,
      projectId: input.projectId,
      runId: input.runId,
      externalRef: input.externalRef,
      meteredUsd: String(input.meteredUsd),
    });
  if (!input.externalRef) {
    await insert;
    return true;
  }
  const rows = await insert
    .onConflictDoNothing({ target: schema.creditLedger.externalRef })
    .returning({ id: schema.creditLedger.id });
  return rows.length > 0;
}

export type CreditReservationResult = {
  status: "reserved" | "existing" | "insufficient";
  balance: number;
  credits: number;
  externalRef: string;
};

/**
 * Atomically authorizes a bounded phase of provider work.
 *
 * A transaction-scoped advisory lock serializes every reservation for one
 * wallet across projects and parallel workflows. The balance test and hold
 * insert run after that lock in the same transaction, so read-only preflights
 * cannot race each other into unbounded overspend.
 */
export async function reserveCredits(input: {
  userId: string;
  credits: number;
  externalRef: string;
  description: string;
  projectId?: string;
  runId?: string;
}): Promise<CreditReservationResult> {
  await reconcileCreditReservations(input.userId);
  const credits = canonicalizeCreditRequirement(input.credits);
  if (credits === 0) {
    return {
      status: "existing",
      balance: await getBalance(input.userId),
      credits,
      externalRef: input.externalRef,
    };
  }
  const client = getSqlClient();
  const [, result] = await client.transaction((tx) => [
    tx`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
    tx`
    with existing as materialized (
      select id
      from credit_ledger
      where external_ref = ${input.externalRef}
        and user_id = ${input.userId}
        and kind = 'adjustment'
        and amount < 0
        and project_id is not distinct from ${input.projectId ?? null}
        and run_id is not distinct from ${input.runId ?? null}
        and not exists (
          select 1
          from credit_ledger already_released
          where already_released.external_ref = ${`release:${input.externalRef}`}
        )
      limit 1
    ),
    wallet as materialized (
      select coalesce(sum(amount), 0) as balance
      from credit_ledger
      where user_id = ${input.userId}
    ),
    inserted as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${input.userId},
        ${String(-credits)},
        'adjustment',
        ${input.description},
        ${input.projectId ?? null},
        ${input.runId ?? null},
        ${input.externalRef}
      from wallet
      where wallet.balance >= ${String(credits)}
        and not exists (select 1 from existing)
        and (
          ${input.runId ?? null}::uuid is null
          or exists (
            select 1
            from generation_runs active_run
            where active_run.id = ${input.runId ?? null}
              and active_run.user_id = ${input.userId}
              and active_run.status in ('queued', 'running', 'awaiting_input')
              and active_run.cancellation_requested_at is null
          )
        )
      on conflict (external_ref) do nothing
      returning id
    )
    select
      case
        when exists (select 1 from existing) then 'existing'
        when exists (select 1 from inserted) then 'reserved'
        else 'insufficient'
      end as status,
      wallet.balance::text as balance
    from wallet
  `,
  ]);
  const row = (
    result as Array<{
      status: "reserved" | "existing" | "insufficient";
      balance: string;
    }>
  )[0];
  return {
    status: row?.status ?? "insufficient",
    balance: Number(row?.balance ?? 0),
    credits,
    externalRef: input.externalRef,
  };
}

/**
 * Releases a phase hold exactly once after all authorized work has either
 * checkpointed or stopped. Actual per-call usage debits remain in the ledger.
 */
export async function releaseCreditReservation(input: {
  userId: string;
  externalRef: string;
  projectId?: string;
  runId?: string;
}): Promise<boolean> {
  const releaseRef = `release:${input.externalRef}`;
  const client = getSqlClient();
  const [, result] = await client.transaction((tx) => [
    tx`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
    tx`
    with reservation as materialized (
      select
        amount,
        greatest(
          0,
          -amount - coalesce((
            select sum(claimed.amount)
            from credit_ledger claimed
            where claimed.user_id = ${input.userId}
              and claimed.external_ref like
                ('reservation-claim-release:' || ${input.externalRef} || ':%')
          ), 0)
        ) as remaining
      from credit_ledger
      where external_ref = ${input.externalRef}
        and user_id = ${input.userId}
        and kind = 'adjustment'
        and amount < 0
        and project_id is not distinct from ${input.projectId ?? null}
        and run_id is not distinct from ${input.runId ?? null}
        and not exists (
          select 1
          from credit_ledger released
          where released.external_ref = ${`release:${input.externalRef}`}
        )
      limit 1
    ),
    inserted as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${input.userId},
        reservation.remaining,
        'adjustment',
        'Release generation credit reservation',
        ${input.projectId ?? null},
        ${input.runId ?? null},
        ${releaseRef}
      from reservation
      on conflict (external_ref) do nothing
      returning id
    )
    select exists (select 1 from inserted) as released
  `,
  ]);
  return (result as Array<{ released: boolean }>)[0]?.released ?? false;
}

/**
 * Releases every still-open generation hold for one run. This is idempotent
 * and safe to call from workflow finally blocks, delayed cancellation cleanup,
 * startup-failure cleanup, and a terminal-run sweeper.
 */
export async function releaseRunCreditReservations(input: {
  userId: string;
  runId: string;
}): Promise<number> {
  const client = getSqlClient();
  const [, result] = await client.transaction((tx) => [
    tx`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
    tx`
    with reservations as materialized (
      select
        reservation.external_ref,
        reservation.project_id,
        reservation.run_id,
        greatest(
          0,
          -reservation.amount - coalesce((
            select sum(claimed.amount)
            from credit_ledger claimed
            where claimed.user_id = ${input.userId}
              and claimed.external_ref like
                ('reservation-claim-release:' || reservation.external_ref || ':%')
          ), 0)
        ) as remaining
      from credit_ledger reservation
      where reservation.user_id = ${input.userId}
        and reservation.run_id = ${input.runId}
        and reservation.kind = 'adjustment'
        and reservation.amount < 0
        and reservation.external_ref like 'generation-reservation:%'
        and not exists (
          select 1
          from credit_ledger released
          where released.external_ref = 'release:' || reservation.external_ref
        )
    ),
    inserted as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${input.userId},
        reservations.remaining,
        'adjustment',
        'Release terminal generation reservation',
        reservations.project_id,
        reservations.run_id,
        'release:' || reservations.external_ref
      from reservations
      on conflict (external_ref) do nothing
      returning id
    )
    select count(*)::int as released from inserted
  `,
  ]);
  return (result as Array<{ released: number }>)[0]?.released ?? 0;
}

/** Prevents a cancelled run's already-active step from claiming new calls. */
export async function requestRunReservationClose(input: {
  userId: string;
  runId: string;
}): Promise<void> {
  const client = getSqlClient();
  await client.transaction((tx) => [
    tx`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
    tx`
      insert into credit_ledger (
        user_id, amount, kind, description, run_id, external_ref
      )
      values (
        ${input.userId},
        0,
        'adjustment',
        'Close generation reservations after active calls settle',
        ${input.runId},
        ${`reservation-close-request:${input.runId}`}
      )
      on conflict (external_ref) do nothing
    `,
  ]);
}

/** Throws when the balance would not cover `requiredCredits`. */
export async function assertCredits(userId: string, requiredCredits: number): Promise<void> {
  requiredCredits = canonicalizeCreditRequirement(requiredCredits);
  const balance = await getBalance(userId);
  if (balance < requiredCredits) {
    throw new InsufficientCreditsError(balance, requiredCredits);
  }
}

/** Route-level gate: covers a metered-USD estimate at retail markup. */
export async function assertCreditsForUsd(userId: string, estimateUsd: number): Promise<void> {
  await reconcileCreditReservations(userId);
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
    .where(
      and(
        eq(schema.creditLedger.userId, userId),
        sql`coalesce(${schema.creditLedger.externalRef}, '') !~
          '^(generation-reservation:|interactive-reservation:|metering-claim:|metering-intent:|intent-settled:|intent-aborted:|reservation-claim-release:|reservation-close-request:|release:(generation-reservation:|interactive-reservation:|metering-claim:))'`,
      ),
    )
    .orderBy(sql`${schema.creditLedger.createdAt} desc`)
    .limit(limit);
}

import { getCache } from "@vercel/functions";
import { and, eq, gte, sum } from "drizzle-orm";
import { getDb, getSqlClient, schema } from "@/db";
import { assertProjectSpendAccess } from "@/lib/project-spend-access";
import { calculateUsd, type UsageTokens } from "./pricing";
import { canonicalizeCreditRequirement, creditsForUsd } from "./credits-shared";

/**
 * Metering: every LLM call lands in `llm_calls` as ground truth for margins.
 * Spending is gated by the prepaid credit wallet (`src/lib/billing/credits.ts`)
 * — the former monthly USD budget system was removed when credits arrived,
 * since a prepaid balance already is a hard spending cap.
 */

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const SPEND_CACHE_TTL_SECONDS = 60;

function spendCacheKey(userId: string) {
  return `spend:${userId}`;
}

export async function getMonthToDateSpend(userId: string): Promise<number> {
  const cache = getCache();
  const cached = await cache.get(spendCacheKey(userId));
  if (typeof cached === "number") return cached;

  const db = getDb();
  const [row] = await db
    .select({ total: sum(schema.llmCalls.usd) })
    .from(schema.llmCalls)
    .where(and(eq(schema.llmCalls.userId, userId), gte(schema.llmCalls.createdAt, monthStart())));

  const spent = Number(row?.total ?? 0);
  await cache.set(spendCacheKey(userId), spent, {
    ttl: SPEND_CACHE_TTL_SECONDS,
    tags: [`spend:${userId}`],
    name: "spend",
  });
  return spent;
}

export type LlmCallRecord = {
  userId: string;
  projectId?: string | null;
  runId?: string | null;
  agentRole: string;
  operation: string;
  model: string;
  usage: UsageTokens & { reasoningTokens?: number };
  latencyMs?: number;
};

export type MeteredLedgerDebit = {
  description: string;
  /** Stable prefix; `:step:N` is appended inside the atomic settlement. */
  externalRefPrefix: string;
  intentRef: string;
  /** Per-attempt child claim created atomically with the intent. */
  reservationRef: string;
  /** Atomically refund operator-verified work whose output was not delivered. */
  compensateDelivery?: { description: string };
};

export type MeteredSettlement = {
  meteredUsd: number;
  /** Exact sum of the numeric(12,4) usage rows committed to credit_ledger. */
  debitedCredits: number;
};

export class ReservationSettlementError extends Error {
  constructor(
    readonly balance: number,
    readonly required: number,
  ) {
    super(
      `Authorized reservation could not settle: ${balance.toFixed(2)} available, ${required.toFixed(2)} additional credits required`,
    );
    this.name = "ReservationSettlementError";
  }
}

function llmCallValues(record: LlmCallRecord, usd: number) {
  return {
    userId: record.userId,
    projectId: record.projectId ?? null,
    runId: record.runId ?? null,
    agentRole: record.agentRole,
    operation: record.operation,
    model: record.model,
    inputTokens: record.usage.inputTokens,
    outputTokens: record.usage.outputTokens,
    cachedInputTokens: record.usage.cachedInputTokens ?? 0,
    reasoningTokens: record.usage.reasoningTokens ?? 0,
    usd: usd.toFixed(6),
    latencyMs: record.latencyMs,
  };
}

async function invalidateSpendCache(userId: string): Promise<void> {
  try {
    await getCache().delete(spendCacheKey(userId));
  } catch {
    // The database is the source of truth and this cache expires in 60s.
    // Never replay a paid provider call because cache invalidation failed.
  }
}

/**
 * Persists an at-most-once provider intent before the external call.
 *
 * If provider work returns but local settlement fails, the surviving marker
 * makes a durable workflow retry stop before calling the provider again.
 * Known provider failures delete the marker so a normal retry is still safe.
 */
export type MeteredCallIntentResult = {
  status:
    "started" | "pending" | "settled" | "insufficient" | "trial_cap" | "project_busy" | "suspended";
  balance: number;
  required: number;
  intentRef: string;
  reservationRef: string;
  optionalLeaseRef: string | null;
};

/** Internal lifetime ceiling for the one included story. Never shown as product copy. */
const TRIAL_STORY_CREDIT_CAP = 10;

export async function beginMeteredCallIntent(input: {
  userId: string;
  projectId?: string | null;
  runId?: string | null;
  intentRef: string;
  intentPrefix: string;
  usagePrefix: string;
  parentReservationRef?: string;
  maxCredits: number;
  description: string;
}): Promise<MeteredCallIntentResult> {
  if (input.projectId) {
    await assertProjectSpendAccess({
      userId: input.userId,
      projectId: input.projectId,
      operationKind: input.runId ? "authoring" : "optional",
    });
  }
  // Holds are numeric(12,4). Round the authorization upward so column
  // quantization can never make the persisted ceiling smaller than the one
  // checked before provider dispatch.
  const maxCredits = canonicalizeCreditRequirement(input.maxCredits);
  const reservationRef = `metering-claim:${input.intentRef}`;
  const optionalLeaseRef =
    input.projectId && !input.runId ? `optional-operation-lease:${input.intentRef}` : null;
  const claimReleaseRef = input.parentReservationRef
    ? `reservation-claim-release:${input.parentReservationRef}:${input.intentRef}`
    : null;
  const client = getSqlClient();
  /**
   * This is one wallet-locked statement by design: replay gates come first;
   * project entitlement, trial spend, parent capacity, and wallet balance form
   * one authorization snapshot; then the child claim, parent transfer, durable
   * intent, and optional project lease are inserted in dependency order. A
   * provider call therefore cannot observe a partial authorization. Real-Neon
   * tests cover the exact trial cap, a concurrent same-intent replay, and
   * sibling claims competing for a partially consumed parent reservation.
   */
  const transactionResults = await client.transaction((tx) => [
    ...(optionalLeaseRef
      ? [
          tx`select pg_advisory_xact_lock(
            hashtextextended('sopher:project-authoring:' || ${input.projectId}, 0)
          )`,
        ]
      : []),
    tx`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
    tx`
    with existing_usage as materialized (
      select usage.id
      from credit_ledger usage
      where usage.user_id = ${input.userId}
        and usage.kind = 'usage'
        and usage.external_ref like ${`${input.usagePrefix}%`}
        and not exists (
          select 1
          from credit_ledger compensated
          where compensated.external_ref =
            'delivery-refund:' ||
            regexp_replace(usage.external_ref, ':step:[0-9]+$', '')
        )
      limit 1
    ),
    pending_intent as materialized (
      select pending.external_ref
      from credit_ledger pending
      where pending.user_id = ${input.userId}
        and pending.amount = 0
        and pending.external_ref like ${`${input.intentPrefix}%`}
        and not exists (
          select 1
          from credit_ledger terminal
          where terminal.external_ref in (
            'intent-settled:' || pending.external_ref,
            'intent-aborted:' || pending.external_ref
          )
        )
      limit 1
    ),
    project_access as materialized (
      select
        project.experience,
        author.suspended,
        (
          author.role = 'admin'
          or exists (
            select 1
            from credit_ledger purchase
            where purchase.user_id = ${input.userId}
              and purchase.kind = 'purchase'
              and purchase.amount > 0
          )
        ) as full_book_unlocked
      from projects project
      inner join users author on author.id = project.user_id
      where ${input.projectId ?? null}::uuid is not null
        and project.id = ${input.projectId ?? null}
        and project.user_id = ${input.userId}
      limit 1
    ),
    trial_spend as materialized (
      select
        coalesce(
          -sum(entry.amount) filter (where entry.kind = 'usage'),
          0
        ) as credits_used,
        coalesce(
          -sum(entry.amount) filter (
            where entry.kind = 'adjustment'
              and entry.amount < 0
              and coalesce(entry.external_ref, '') like 'metering-claim:%'
              and not exists (
                select 1
                from credit_ledger released_claim
                where released_claim.external_ref = 'release:' || entry.external_ref
              )
          ),
          0
        ) as credits_held
      from credit_ledger entry
      where entry.user_id = ${input.userId}
    ),
    trial_cap_blocked as materialized (
      select 1
      from project_access access
      cross join trial_spend spent
      where access.experience = 'trial_short_story'
        and not access.full_book_unlocked
        and (
          spent.credits_used
          + spent.credits_held
          + ${String(maxCredits)}::numeric
        ) > ${String(TRIAL_STORY_CREDIT_CAP)}::numeric
    ),
    project_busy_blocked as materialized (
      select 1
      from generation_runs competing_run
      where ${input.projectId ?? null}::uuid is not null
        and ${input.runId ?? null}::uuid is null
        and competing_run.project_id = ${input.projectId ?? null}
        and competing_run.status in ('queued', 'running', 'awaiting_input')
        and competing_run.kind <> 'export'
      limit 1
    ),
    parent as materialized (
      select
        reservation.external_ref,
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
      where ${input.parentReservationRef ?? null}::text is not null
        and reservation.user_id = ${input.userId}
        and reservation.external_ref = ${input.parentReservationRef ?? null}
        and reservation.kind = 'adjustment'
        and reservation.amount < 0
        and reservation.project_id is not distinct from ${input.projectId ?? null}
        and reservation.run_id is not distinct from ${input.runId ?? null}
        and not exists (
          select 1 from credit_ledger released
          where released.external_ref = 'release:' || reservation.external_ref
        )
      limit 1
    ),
    wallet as materialized (
      select coalesce(sum(amount), 0) as balance
      from credit_ledger
      where user_id = ${input.userId}
    ),
    authorized_start as materialized (
      select
        wallet.balance,
        coalesce((select remaining from parent), 0) as parent_remaining,
        greatest(
          0,
          ${String(maxCredits)}::numeric - coalesce((select remaining from parent), 0)
        ) as additional_required
      from wallet
      where not exists (select 1 from existing_usage)
        and not exists (select 1 from pending_intent)
        and (
          ${input.projectId ?? null}::uuid is null
          or exists (
            select 1
            from project_access access
            where not access.suspended
              and (
                access.experience = 'trial_short_story'
                or access.full_book_unlocked
              )
          )
        )
        and not exists (select 1 from project_busy_blocked)
        and not exists (select 1 from trial_cap_blocked)
        and not exists (
          select 1
          from credit_ledger
          where ${input.runId ?? null}::text is not null
            and external_ref = ${input.runId ? `reservation-close-request:${input.runId}` : null}
        )
        and (
          ${input.runId ?? null}::uuid is null
          or exists (
            select 1
            from generation_runs active_run
            where active_run.id = ${input.runId ?? null}
              and active_run.user_id = ${input.userId}
              and active_run.project_id is not distinct from ${input.projectId ?? null}
              and active_run.status in ('queued', 'running', 'awaiting_input')
          )
        )
        and (
          ${input.parentReservationRef ?? null}::text is null
          or exists (select 1 from parent)
        )
        and wallet.balance >= greatest(
          0,
          ${String(maxCredits)}::numeric - coalesce((select remaining from parent), 0)
        )
    ),
    claim_insert as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${input.userId},
        ${String(-maxCredits)},
        'adjustment',
        ${input.description},
        ${input.projectId ?? null},
        ${input.runId ?? null},
        ${reservationRef}
      from authorized_start
      on conflict (external_ref) do nothing
      returning id
    ),
    parent_claim as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${input.userId},
        least(${String(maxCredits)}::numeric, authorized_start.parent_remaining),
        'adjustment',
        'Transfer phase capacity to provider-call claim',
        ${input.projectId ?? null},
        ${input.runId ?? null},
        ${claimReleaseRef}
      from authorized_start, claim_insert
      where ${claimReleaseRef}::text is not null
      on conflict (external_ref) do nothing
      returning id
    ),
    intent_insert as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${input.userId},
        0,
        'adjustment',
        ${input.description},
        ${input.projectId ?? null},
        ${input.runId ?? null},
        ${input.intentRef}
      from authorized_start, claim_insert
      where
        ${claimReleaseRef}::text is null
        or exists (select 1 from parent_claim)
      on conflict (external_ref) do nothing
      returning id
    ),
    optional_lease as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${input.userId},
        0,
        'adjustment',
        'Hold project mutation boundary through optional AI delivery',
        ${input.projectId ?? null},
        null,
        ${optionalLeaseRef}
      from intent_insert
      where ${optionalLeaseRef}::text is not null
      on conflict (external_ref) do nothing
      returning id
    )
    select
      case
        when exists (
          select 1 from project_access access where access.suspended
        ) then 'suspended'
        when exists (select 1 from existing_usage) then 'settled'
        when exists (select 1 from pending_intent) then 'pending'
        when exists (select 1 from intent_insert)
          and (
            ${optionalLeaseRef}::text is null
            or exists (select 1 from optional_lease)
          )
          then 'started'
        when exists (select 1 from project_busy_blocked) then 'project_busy'
        when exists (select 1 from trial_cap_blocked) then 'trial_cap'
        else 'insufficient'
      end as status,
      wallet.balance::text as balance,
      coalesce(
        (select additional_required::text from authorized_start),
        ${String(maxCredits)}
      ) as required
    from wallet
  `,
  ]);
  const result = transactionResults.at(-1);
  const row = (
    result as Array<{
      status: MeteredCallIntentResult["status"];
      balance: string;
      required: string;
    }>
  )[0];
  return {
    status: row?.status ?? "insufficient",
    balance: Number(row?.balance ?? 0),
    required: Number(row?.required ?? maxCredits),
    intentRef: input.intentRef,
    reservationRef,
    optionalLeaseRef,
  };
}

export async function abortMeteredCallIntent(input: {
  userId: string;
  intentRef: string;
  reservationRef: string;
  projectId?: string | null;
  runId?: string | null;
}): Promise<void> {
  const releaseRef = `release:${input.reservationRef}`;
  const optionalLeaseRef =
    input.projectId && !input.runId ? `optional-operation-lease:${input.intentRef}` : null;
  const client = getSqlClient();
  await client.transaction((tx) => [
    ...(optionalLeaseRef
      ? [
          tx`select pg_advisory_xact_lock(
            hashtextextended('sopher:project-authoring:' || ${input.projectId}, 0)
          )`,
        ]
      : []),
    tx`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
    tx`
    with intent as materialized (
      select intent.user_id, intent.project_id, intent.run_id
      from credit_ledger intent
      where intent.user_id = ${input.userId}
        and intent.external_ref = ${input.intentRef}
        and intent.kind = 'adjustment'
        and intent.amount = 0
        and intent.project_id is not distinct from ${input.projectId ?? null}
        and intent.run_id is not distinct from ${input.runId ?? null}
        and not exists (
          select 1
          from credit_ledger terminal
          where terminal.external_ref in (
            ${`intent-settled:${input.intentRef}`},
            ${`intent-aborted:${input.intentRef}`}
          )
        )
      limit 1
    ),
    claim as materialized (
      select reservation.amount
      from credit_ledger reservation
      inner join intent
        on intent.user_id = reservation.user_id
        and intent.project_id is not distinct from reservation.project_id
        and intent.run_id is not distinct from reservation.run_id
      where reservation.user_id = ${input.userId}
        and reservation.external_ref = ${input.reservationRef}
        and reservation.kind = 'adjustment'
        and reservation.amount < 0
        and not exists (
          select 1
          from credit_ledger released
          where released.external_ref = ${releaseRef}
        )
      limit 1
    ),
    parent_claim as materialized (
      select claimed.external_ref, claimed.amount
      from credit_ledger claimed
      inner join intent
        on intent.user_id = claimed.user_id
        and intent.project_id is not distinct from claimed.project_id
        and intent.run_id is not distinct from claimed.run_id
      inner join credit_ledger parent
        on parent.user_id = claimed.user_id
        and claimed.external_ref =
          'reservation-claim-release:' || parent.external_ref || ':' || ${input.intentRef}
        and parent.kind = 'adjustment'
        and parent.amount < 0
        and parent.project_id is not distinct from claimed.project_id
        and parent.run_id is not distinct from claimed.run_id
      where claimed.user_id = ${input.userId}
        and claimed.kind = 'adjustment'
        and claimed.amount > 0
        and not exists (
          select 1
          from credit_ledger parent_release
          where parent_release.external_ref = 'release:' || parent.external_ref
        )
      limit 1
    ),
    aborted as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${input.userId}, 0, 'adjustment', 'Provider attempt aborted before completion',
        ${input.projectId ?? null}, ${input.runId ?? null}, ${`intent-aborted:${input.intentRef}`}
      from intent, claim
      on conflict (external_ref) do nothing
      returning id
    ),
    released as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${input.userId}, -claim.amount, 'adjustment', 'Release aborted provider-call claim',
        ${input.projectId ?? null}, ${input.runId ?? null}, ${releaseRef}
      from claim, aborted
      on conflict (external_ref) do nothing
      returning id
    ),
    parent_restored as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${input.userId},
        -parent_claim.amount,
        'adjustment',
        'Restore phase capacity after pre-dispatch abort',
        ${input.projectId ?? null},
        ${input.runId ?? null},
        parent_claim.external_ref || ':restore'
      from parent_claim, aborted
      on conflict (external_ref) do nothing
      returning id
    ),
    optional_lease_released as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${input.userId},
        0,
        'adjustment',
        'Release optional operation after pre-dispatch abort',
        ${input.projectId ?? null},
        null,
        ${optionalLeaseRef ? `release:${optionalLeaseRef}` : null}
      from aborted
      where ${optionalLeaseRef}::text is not null
      on conflict (external_ref) do nothing
      returning id
    )
    select
      exists (select 1 from released) as released,
      exists (select 1 from parent_restored) as parent_restored
  `,
  ]);
}

/**
 * Releases project mutation leases only after optional provider output has
 * either been delivered durably or refunded. The project advisory lock makes
 * release and authoring-run insertion mutually exclusive.
 */
export async function releaseOptionalOperationLeases(input: {
  userId: string;
  projectId?: string | null;
  leaseRefs: string[];
}): Promise<void> {
  const refs = [
    ...new Set(input.leaseRefs.filter((ref) => ref.startsWith("optional-operation-lease:"))),
  ];
  if (!input.projectId || refs.length === 0) return;
  const client = getSqlClient();
  await client.transaction((tx) => [
    tx`select pg_advisory_xact_lock(
      hashtextextended('sopher:project-authoring:' || ${input.projectId}, 0)
    )`,
    ...refs.map(
      (ref) => tx`
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, run_id, external_ref
        )
        values (
          ${input.userId},
          0,
          'adjustment',
          'Release optional operation after durable delivery',
          ${input.projectId},
          null,
          ${`release:${ref}`}
        )
        on conflict (external_ref) do nothing
      `,
    ),
  ]);
}

/**
 * Repairs the narrow crash window where durable output committed but the
 * response died before its lease-release statement. Callers invoke this only
 * after an exact idempotency-key replay proves delivery.
 */
export async function releaseReplayedOptionalOperationLeases(input: {
  userId: string;
  projectId: string;
  idempotencyKey: string;
}): Promise<void> {
  const client = getSqlClient();
  await client.transaction((tx) => [
    tx`select pg_advisory_xact_lock(
      hashtextextended('sopher:project-authoring:' || ${input.projectId}, 0)
    )`,
    tx`
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        lease.user_id,
        0,
        'adjustment',
        'Repair optional operation lease after durable replay',
        lease.project_id,
        null,
        'release:' || lease.external_ref
      from credit_ledger lease
      where lease.user_id = ${input.userId}
        and lease.project_id = ${input.projectId}
        and lease.external_ref like 'optional-operation-lease:%'
        and lease.external_ref like ${`%:${input.idempotencyKey}:%`}
        and not exists (
          select 1
          from credit_ledger released
          where released.external_ref = 'release:' || lease.external_ref
        )
      on conflict (external_ref) do nothing
    `,
  ]);
}

/**
 * Operator-only recovery after the Gateway dashboard proves an unresolved
 * attempt produced no billable generation. Ambiguous attempts must remain
 * held; this function deliberately has no timer-based path.
 */
export async function reconcileMeteredCallAsUncharged(input: {
  intentRef: string;
  adminId: string;
  note: string;
}): Promise<boolean> {
  const reservationRef = `metering-claim:${input.intentRef}`;
  const releaseRef = `release:${reservationRef}`;
  const abortedRef = `intent-aborted:${input.intentRef}`;
  const description = `Admin ${input.adminId} verified no Gateway charge: ${input.note}`.slice(
    0,
    1_000,
  );
  const client = getSqlClient();
  const [, result] = await client.transaction((tx) => [
    tx`
      select pg_advisory_xact_lock(hashtextextended(user_id, 0))
      from credit_ledger
      where external_ref = ${input.intentRef}
      limit 1
    `,
    tx`
    with target as materialized (
      select
        intent.user_id,
        intent.project_id,
        intent.run_id,
        claim.amount
      from credit_ledger intent
      inner join credit_ledger claim
        on claim.external_ref = ${reservationRef}
        and claim.user_id = intent.user_id
        and claim.kind = 'adjustment'
        and claim.amount < 0
        and claim.project_id is not distinct from intent.project_id
        and claim.run_id is not distinct from intent.run_id
      where intent.external_ref = ${input.intentRef}
        and intent.kind = 'adjustment'
        and intent.amount = 0
        and intent.external_ref like 'metering-intent:%'
        and intent.created_at <= now() - interval '1 hour'
      limit 1
    ),
    parent_claim as materialized (
      select claimed.external_ref, claimed.amount
      from credit_ledger claimed
      inner join target
        on target.user_id = claimed.user_id
        and target.project_id is not distinct from claimed.project_id
        and target.run_id is not distinct from claimed.run_id
      inner join credit_ledger parent
        on parent.user_id = claimed.user_id
        and claimed.external_ref =
          'reservation-claim-release:' || parent.external_ref || ':' || ${input.intentRef}
        and parent.kind = 'adjustment'
        and parent.amount < 0
        and parent.project_id is not distinct from claimed.project_id
        and parent.run_id is not distinct from claimed.run_id
      where claimed.kind = 'adjustment'
        and claimed.amount > 0
        and not exists (
          select 1
          from credit_ledger parent_release
          where parent_release.external_ref = 'release:' || parent.external_ref
        )
      limit 1
    ),
    aborted as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        target.user_id,
        0,
        'adjustment',
        ${description},
        target.project_id,
        target.run_id,
        ${abortedRef}
      from target
      where not exists (
        select 1
        from credit_ledger terminal
        where terminal.external_ref in (
          ${`intent-settled:${input.intentRef}`},
          ${abortedRef}
        )
      )
        and not exists (
          select 1
          from credit_ledger released
          where released.external_ref = ${releaseRef}
        )
      on conflict (external_ref) do nothing
      returning user_id, project_id, run_id
    ),
    released as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        aborted.user_id,
        -target.amount,
        'adjustment',
        ${description},
        aborted.project_id,
        aborted.run_id,
        ${releaseRef}
      from aborted
      cross join target
      on conflict (external_ref) do nothing
      returning id
    ),
    parent_restored as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        aborted.user_id,
        -parent_claim.amount,
        'adjustment',
        ${description},
        aborted.project_id,
        aborted.run_id,
        parent_claim.external_ref || ':restore'
      from aborted, parent_claim
      on conflict (external_ref) do nothing
      returning id
    )
    select
      exists (select 1 from released) as released,
      exists (select 1 from parent_restored) as parent_restored
  `,
  ]);
  return (result as Array<{ released: boolean }>)[0]?.released ?? false;
}

function parseIntentScope(intentRef: string): {
  logicalScope: string;
  operation: string;
  attemptId: string;
} {
  const prefix = "metering-intent:";
  const attemptMarker = ":attempt:";
  if (!intentRef.startsWith(prefix)) throw new Error("Invalid metering intent");
  const attemptAt = intentRef.lastIndexOf(attemptMarker);
  if (attemptAt < prefix.length) throw new Error("Invalid metering intent");
  const scopedOperation = intentRef.slice(prefix.length, attemptAt);
  const operationAt = scopedOperation.lastIndexOf(":");
  if (operationAt < 1 || operationAt === scopedOperation.length - 1) {
    throw new Error("Invalid metering intent");
  }
  return {
    logicalScope: scopedOperation.slice(0, operationAt),
    operation: scopedOperation.slice(operationAt + 1),
    attemptId: intentRef.slice(attemptAt + attemptMarker.length),
  };
}

/**
 * Operator recovery for an attempt that the Gateway proves was charged.
 * The supplied usage is priced by the same canonical model table and settles
 * through the original child claim, so no hand-entered credit amount exists.
 */
export async function reconcileMeteredCallAsCharged(input: {
  intentRef: string;
  adminId: string;
  note: string;
  calls: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
    imageCount?: number;
  }>;
}): Promise<MeteredSettlement> {
  const { logicalScope, operation, attemptId } = parseIntentScope(input.intentRef);
  const externalRefPrefix = `llm:${logicalScope}:${operation}:attempt:${attemptId}`;
  const reservationRef = `metering-claim:${input.intentRef}`;
  const releaseRef = `release:${reservationRef}`;
  const settledIntentRef = `intent-settled:${input.intentRef}`;
  const deliveryRefundRef = `delivery-refund:${externalRefPrefix}`;
  const description = `Admin ${input.adminId} verified Gateway charge: ${input.note}`.slice(
    0,
    1_000,
  );
  const refundDescription =
    `Admin ${input.adminId} refunded undelivered verified charge: ${input.note}`.slice(0, 1_000);
  if (input.calls.length === 0) throw new Error("At least one verified provider call is required");

  const costed = input.calls.map((call, index) => {
    const usage = {
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      cachedInputTokens: call.cachedInputTokens ?? 0,
      cacheWriteTokens: call.cacheWriteTokens ?? 0,
      reasoningTokens: call.reasoningTokens ?? 0,
      imageCount: call.imageCount ?? 0,
    };
    const usd = calculateUsd(call.model, usage);
    return {
      call,
      usage,
      usd,
      credits: creditsForUsd(usd),
      externalRef: `${externalRefPrefix}:step:${index}`,
    };
  });
  const totalUsd = costed.reduce((total, item) => total + item.usd, 0);
  const totalCredits = costed.reduce((total, item) => total + item.credits, 0);
  if (totalUsd <= 0 || totalCredits <= 0) {
    throw new Error("A verified charged reconciliation must include positive billable usage");
  }
  const callRows = JSON.stringify(
    costed.map(({ call, usage, usd }) => ({
      agent_role: "admin-reconciliation",
      operation,
      model: call.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cached_input_tokens: usage.cachedInputTokens,
      reasoning_tokens: usage.reasoningTokens,
      usd: usd.toFixed(6),
      latency_ms: null,
    })),
  );
  const usageRows = JSON.stringify(
    costed.map(({ usd, credits, externalRef }) => ({
      amount: String(-credits),
      kind: "usage",
      description,
      external_ref: externalRef,
      metered_usd: String(usd),
    })),
  );

  const client = getSqlClient();
  const [, result] = await client.transaction((tx) => [
    // The first statement resolves only the wallet lock key. Every
    // authorization-relevant field is re-read below while that lock is held.
    tx`
      select pg_advisory_xact_lock(hashtextextended(intent.user_id, 0))
      from credit_ledger intent
      where intent.external_ref = ${input.intentRef}
        and intent.kind = 'adjustment'
        and intent.amount = 0
        and intent.external_ref like 'metering-intent:%'
        and intent.created_at <= now() - interval '1 hour'
      limit 1
    `,
    tx`
      with target as materialized (
        select
          intent.user_id,
          intent.project_id,
          intent.run_id,
          -claim.amount as authorized
        from credit_ledger intent
        inner join credit_ledger claim
          on claim.external_ref = ${reservationRef}
          and claim.user_id = intent.user_id
          and claim.kind = 'adjustment'
          and claim.amount < 0
          and claim.project_id is not distinct from intent.project_id
          and claim.run_id is not distinct from intent.run_id
        where intent.external_ref = ${input.intentRef}
          and intent.kind = 'adjustment'
          and intent.amount = 0
          and intent.external_ref like 'metering-intent:%'
          and intent.created_at <= now() - interval '1 hour'
        limit 1
      ),
      call_values as materialized (
        select *
        from jsonb_to_recordset(${callRows}::jsonb) as values_row(
          agent_role text,
          operation text,
          model text,
          input_tokens integer,
          output_tokens integer,
          cached_input_tokens integer,
          reasoning_tokens integer,
          usd numeric,
          latency_ms integer
        )
      ),
      usage_values as materialized (
        select *
        from jsonb_to_recordset(${usageRows}::jsonb) as values_row(
          amount numeric,
          kind text,
          description text,
          external_ref text,
          metered_usd numeric
        )
      ),
      existing_usage as materialized (
        select usage.id, usage.amount
        from credit_ledger usage
        cross join target
        where usage.user_id = target.user_id
          and usage.kind = 'usage'
          and usage.external_ref like ${`${externalRefPrefix}:%`}
          and usage.project_id is not distinct from target.project_id
          and usage.run_id is not distinct from target.run_id
      ),
      usage_conflict as materialized (
        select ledger.id
        from credit_ledger ledger
        inner join usage_values
          on usage_values.external_ref = ledger.external_ref
        limit 1
      ),
      existing_settlement as materialized (
        select settled.id
        from credit_ledger settled
        cross join target
        where settled.user_id = target.user_id
          and settled.external_ref = ${settledIntentRef}
          and settled.kind = 'adjustment'
          and settled.amount = 0
          and settled.project_id is not distinct from target.project_id
          and settled.run_id is not distinct from target.run_id
        limit 1
      ),
      existing_delivery_refund as materialized (
        select refunded.id
        from credit_ledger refunded
        cross join target
        where refunded.user_id = target.user_id
          and refunded.external_ref = ${deliveryRefundRef}
          and refunded.kind = 'adjustment'
          and refunded.amount > 0
          and refunded.project_id is not distinct from target.project_id
          and refunded.run_id is not distinct from target.run_id
        limit 1
      ),
      required_debit as materialized (
        select coalesce(sum(-cast(amount as numeric(12, 4))), 0) as credits
        from usage_values
      ),
      authorized_reconciliation as materialized (
        select target.*
        from target
        where not exists (
            select 1
            from credit_ledger released
            where released.external_ref = ${releaseRef}
          )
          and not exists (
            select 1
            from credit_ledger terminal
            where terminal.external_ref in (
              ${settledIntentRef},
              ${`intent-aborted:${input.intentRef}`}
            )
          )
          and not exists (select 1 from existing_usage)
          and not exists (select 1 from usage_conflict)
          and not exists (select 1 from existing_delivery_refund)
          and (select credits from required_debit) <= target.authorized
      ),
      usage_insert as (
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, run_id,
          external_ref, metered_usd
        )
        select
          authorized_reconciliation.user_id,
          usage_values.amount,
          usage_values.kind,
          usage_values.description,
          authorized_reconciliation.project_id,
          authorized_reconciliation.run_id,
          usage_values.external_ref,
          usage_values.metered_usd
        from usage_values
        cross join authorized_reconciliation
        on conflict (external_ref) do nothing
        returning id, amount
      ),
      call_insert as (
        insert into llm_calls (
          user_id, project_id, run_id, agent_role, operation, model,
          input_tokens, output_tokens, cached_input_tokens, reasoning_tokens,
          usd, latency_ms
        )
        select
          authorized_reconciliation.user_id,
          authorized_reconciliation.project_id,
          authorized_reconciliation.run_id,
          call_values.agent_role,
          call_values.operation,
          call_values.model,
          call_values.input_tokens,
          call_values.output_tokens,
          call_values.cached_input_tokens,
          call_values.reasoning_tokens,
          call_values.usd,
          call_values.latency_ms
        from call_values
        cross join authorized_reconciliation
        where (select count(*) from usage_insert) = ${costed.length}
        returning id
      ),
      release_insert as (
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, run_id, external_ref
        )
        select
          authorized_reconciliation.user_id,
          authorized_reconciliation.authorized,
          'adjustment',
          'Release reconciled provider-call claim',
          authorized_reconciliation.project_id,
          authorized_reconciliation.run_id,
          ${releaseRef}
        from authorized_reconciliation
        where (select count(*) from usage_insert) = ${costed.length}
          and (select count(*) from call_insert) = ${costed.length}
        on conflict (external_ref) do nothing
        returning id
      ),
      settled_intent as (
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, run_id, external_ref
        )
        select
          authorized_reconciliation.user_id,
          0,
          'adjustment',
          'Provider result settled by administrator',
          authorized_reconciliation.project_id,
          authorized_reconciliation.run_id,
          ${settledIntentRef}
        from authorized_reconciliation, release_insert
        on conflict (external_ref) do nothing
        returning id
      ),
      delivery_refund as (
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, run_id, external_ref
        )
        select
          authorized_reconciliation.user_id,
          (select sum(-amount) from usage_insert),
          'adjustment',
          ${refundDescription},
          authorized_reconciliation.project_id,
          authorized_reconciliation.run_id,
          ${deliveryRefundRef}
        from authorized_reconciliation, settled_intent
        where exists (select 1 from usage_insert)
        on conflict (external_ref) do nothing
        returning id
      ),
      parent_transfer as materialized (
        select transferred.external_ref, transferred.amount
        from credit_ledger transferred
        cross join target
        inner join credit_ledger parent
          on parent.user_id = transferred.user_id
          and transferred.external_ref =
            'reservation-claim-release:' || parent.external_ref || ':' || ${input.intentRef}
          and parent.kind = 'adjustment'
          and parent.amount < 0
          and parent.project_id is not distinct from transferred.project_id
          and parent.run_id is not distinct from transferred.run_id
        where transferred.user_id = target.user_id
          and transferred.kind = 'adjustment'
          and transferred.amount > 0
          and transferred.project_id is not distinct from target.project_id
          and transferred.run_id is not distinct from target.run_id
          and not exists (
            select 1
            from credit_ledger parent_release
            where parent_release.external_ref = 'release:' || parent.external_ref
          )
        limit 1
      ),
      compensated_parent_restore as (
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, run_id, external_ref
        )
        select
          authorized_reconciliation.user_id,
          -parent_transfer.amount,
          'adjustment',
          'Restore open phase capacity after reconciled delivery refund',
          authorized_reconciliation.project_id,
          authorized_reconciliation.run_id,
          parent_transfer.external_ref || ':delivery-restore'
        from authorized_reconciliation, parent_transfer, delivery_refund
        on conflict (external_ref) do nothing
        returning id
      )
      select
        (
          (
            exists (select 1 from settled_intent)
            and exists (select 1 from delivery_refund)
          )
          or (
            exists (select 1 from existing_settlement)
            and exists (select 1 from existing_delivery_refund)
            and (select count(*) from existing_usage) = ${costed.length}
          )
        ) as recorded,
        coalesce(
          (select authorized::text from authorized_reconciliation),
          (select authorized::text from target),
          '0'
        ) as authorized,
        (select credits::text from required_debit) as required,
        coalesce(
          (select sum(-amount)::text from usage_insert),
          (
            select sum(-amount)::text
            from existing_usage
            where exists (select 1 from existing_settlement)
              and exists (select 1 from existing_delivery_refund)
          ),
          '0'
        ) as debited_credits,
        (select user_id from target) as user_id
    `,
  ]);
  const settled = (
    result as Array<{
      recorded: boolean;
      authorized: string;
      required: string;
      debited_credits: string;
      user_id: string | null;
    }>
  )[0];
  if (!settled?.user_id) {
    throw new Error("The intent is not old enough, is malformed, or no longer exists");
  }
  if (!settled.recorded) {
    const authorized = Number(settled.authorized ?? 0);
    const required = Number(settled.required ?? 0);
    throw new ReservationSettlementError(authorized, Math.max(0, required - authorized));
  }
  await invalidateSpendCache(settled.user_id);
  return {
    meteredUsd: totalUsd,
    debitedCredits: Number(settled.debited_credits),
  };
}

/**
 * A caller retried the same stable paid action after never receiving its
 * output. Refund the latest settled attempt exactly so the logical scope can
 * authorize one compensated redo without retaining an undelivered charge.
 */
export async function refundSettledLogicalUsageForRedo(input: {
  userId: string;
  usagePrefix: string;
  projectId?: string | null;
}): Promise<boolean> {
  const client = getSqlClient();
  const results = await client.transaction((tx) => [
    ...(input.projectId
      ? [
          tx`select pg_advisory_xact_lock(
            hashtextextended('sopher:project-authoring:' || ${input.projectId}, 0)
          )`,
        ]
      : []),
    tx`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
    tx`
      with attempts as materialized (
        select
          regexp_replace(usage.external_ref, ':step:[0-9]+$', '') as prefix,
          sum(-usage.amount) as credits,
          min(usage.project_id::text)::uuid as project_id,
          min(usage.run_id::text)::uuid as run_id,
          max(usage.created_at) as latest
        from credit_ledger usage
        where usage.user_id = ${input.userId}
          and usage.kind = 'usage'
          and usage.external_ref like ${`${input.usagePrefix}%`}
          and not exists (
            select 1 from credit_ledger refunded
            where refunded.external_ref =
              'delivery-refund:' ||
              regexp_replace(usage.external_ref, ':step:[0-9]+$', '')
          )
        group by regexp_replace(usage.external_ref, ':step:[0-9]+$', '')
        order by latest desc
        limit 1
      ),
      parent_claim as materialized (
        select claimed.external_ref, claimed.amount
        from credit_ledger claimed
        cross join attempts
        inner join credit_ledger parent
          on parent.user_id = claimed.user_id
          and claimed.external_ref =
            'reservation-claim-release:' ||
            parent.external_ref ||
            ':' ||
            regexp_replace(attempts.prefix, '^llm:', 'metering-intent:')
          and parent.kind = 'adjustment'
          and parent.amount < 0
          and parent.project_id is not distinct from attempts.project_id
          and parent.run_id is not distinct from attempts.run_id
        where claimed.user_id = ${input.userId}
          and claimed.kind = 'adjustment'
          and claimed.amount > 0
          and claimed.project_id is not distinct from attempts.project_id
          and claimed.run_id is not distinct from attempts.run_id
          and not exists (
            select 1
            from credit_ledger parent_release
            where parent_release.external_ref = 'release:' || parent.external_ref
          )
        limit 1
      ),
      refunded as (
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, run_id, external_ref
        )
        select
          ${input.userId},
          attempts.credits,
          'adjustment',
          'Compensated redo: settled provider output was not delivered',
          attempts.project_id,
          attempts.run_id,
          'delivery-refund:' || attempts.prefix
        from attempts
        on conflict (external_ref) do nothing
        returning id
      ),
      parent_restored as (
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, run_id, external_ref
        )
        select
          ${input.userId},
          -parent_claim.amount,
          'adjustment',
          'Restore phase capacity after compensated redo',
          attempts.project_id,
          attempts.run_id,
          parent_claim.external_ref || ':delivery-restore'
        from parent_claim, attempts, refunded
        on conflict (external_ref) do nothing
        returning id
      ),
      optional_lease_released as (
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, run_id, external_ref
        )
        select
          ${input.userId},
          0,
          'adjustment',
          'Release optional operation lease after compensated redo',
          attempts.project_id,
          null,
          'release:optional-operation-lease:' ||
            regexp_replace(attempts.prefix, '^llm:', 'metering-intent:')
        from attempts, refunded
        where attempts.project_id is not null
          and attempts.run_id is null
        on conflict (external_ref) do nothing
        returning id
      )
      select exists (select 1 from refunded) as refunded
    `,
  ]);
  const result = results.at(-1);
  return (result as Array<{ refunded: boolean }>)[0]?.refunded ?? false;
}

export async function attachGatewayGenerationIds(input: {
  userId: string;
  externalRef: string;
  generationIds: string[];
}): Promise<void> {
  if (input.generationIds.length === 0) return;
  await getDb()
    .update(schema.creditLedger)
    .set({
      description: `Metering intent; Gateway generations: ${input.generationIds.join(",")}`.slice(
        0,
        1_000,
      ),
    })
    .where(
      and(
        eq(schema.creditLedger.userId, input.userId),
        eq(schema.creditLedger.externalRef, input.externalRef),
      ),
    );
}

/** Persists one llm_calls row and busts the cached month-to-date spend. Returns the metered USD. */
export async function recordLlmCall(record: LlmCallRecord): Promise<number> {
  const usd = calculateUsd(record.model, record.usage);
  const db = getDb();
  await db.insert(schema.llmCalls).values(llmCallValues(record, usd));
  await invalidateSpendCache(record.userId);
  return usd;
}

/**
 * Settles every model step from one provider result in a single SQL statement.
 * Either all llm_calls rows, all per-step usage debits, the intent terminal
 * marker, and the child-claim release commit, or none do.
 */
export async function recordLlmCallsAndDebit(
  records: LlmCallRecord[],
  debit: MeteredLedgerDebit,
): Promise<MeteredSettlement> {
  if (records.length === 0) return { meteredUsd: 0, debitedCredits: 0 };
  const userId = records[0].userId;
  if (records.some((record) => record.userId !== userId)) {
    throw new Error("A metering settlement cannot span wallets");
  }
  const projectId = records[0].projectId ?? null;
  const runId = records[0].runId ?? null;
  if (
    records.some(
      (record) => (record.projectId ?? null) !== projectId || (record.runId ?? null) !== runId,
    )
  ) {
    throw new Error("A metering settlement cannot span project or run scopes");
  }

  const costed = records.map((record, index) => {
    const usd = calculateUsd(record.model, record.usage);
    return {
      record,
      usd,
      credits: creditsForUsd(usd),
      externalRef: `${debit.externalRefPrefix}:step:${index}`,
    };
  });
  const totalUsd = costed.reduce((total, item) => total + item.usd, 0);
  const releaseRef = `release:${debit.reservationRef}`;
  const settledIntentRef = `intent-settled:${debit.intentRef}`;
  const deliveryRefundRef = `delivery-refund:${debit.externalRefPrefix}`;
  const callRows = JSON.stringify(
    costed.map(({ record, usd }) => ({
      user_id: record.userId,
      project_id: record.projectId ?? null,
      run_id: record.runId ?? null,
      agent_role: record.agentRole,
      operation: record.operation,
      model: record.model,
      input_tokens: record.usage.inputTokens,
      output_tokens: record.usage.outputTokens,
      cached_input_tokens: record.usage.cachedInputTokens ?? 0,
      reasoning_tokens: record.usage.reasoningTokens ?? 0,
      usd: usd.toFixed(6),
      latency_ms: record.latencyMs ?? null,
    })),
  );
  const usageRows = JSON.stringify(
    costed.map(({ record, usd, credits, externalRef }) => ({
      user_id: record.userId,
      amount: String(-credits),
      kind: "usage",
      description: debit.description,
      project_id: record.projectId ?? null,
      run_id: record.runId ?? null,
      external_ref: externalRef,
      metered_usd: String(usd),
    })),
  );

  const client = getSqlClient();
  const [, result] = await client.transaction((tx) => [
    tx`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
    tx`
    with call_values as materialized (
      select *
      from jsonb_to_recordset(${callRows}::jsonb) as values_row(
        user_id text,
        project_id uuid,
        run_id uuid,
        agent_role text,
        operation text,
        model text,
        input_tokens integer,
        output_tokens integer,
        cached_input_tokens integer,
        reasoning_tokens integer,
        usd numeric,
        latency_ms integer
      )
    ),
    usage_values as materialized (
      select *
      from jsonb_to_recordset(${usageRows}::jsonb) as values_row(
        user_id text,
        amount numeric,
        kind text,
        description text,
        project_id uuid,
        run_id uuid,
        external_ref text,
        metered_usd numeric
      )
    ),
    existing_usage as materialized (
      select id, amount
      from credit_ledger
      where user_id = ${userId}
        and kind = 'usage'
        and external_ref like ${`${debit.externalRefPrefix}:%`}
    ),
    usage_conflict as materialized (
      select ledger.id
      from credit_ledger ledger
      inner join usage_values
        on usage_values.external_ref = ledger.external_ref
      limit 1
    ),
    existing_settlement as materialized (
      select id
      from credit_ledger
      where user_id = ${userId}
        and external_ref = ${settledIntentRef}
        and kind = 'adjustment'
        and amount = 0
        and project_id is not distinct from ${projectId}
        and run_id is not distinct from ${runId}
      limit 1
    ),
    required_debit as materialized (
      select coalesce(sum(-cast(amount as numeric(12, 4))), 0) as credits
      from usage_values
    ),
    claim as materialized (
      select -reservation.amount as authorized
      from credit_ledger reservation
      where reservation.user_id = ${userId}
        and reservation.external_ref = ${debit.reservationRef}
        and reservation.kind = 'adjustment'
        and reservation.amount < 0
        and reservation.project_id is not distinct from ${projectId}
        and reservation.run_id is not distinct from ${runId}
        and not exists (
          select 1 from credit_ledger
          where external_ref = ${releaseRef}
        )
      limit 1
    ),
    authorized_settlement as materialized (
      select claim.authorized
      from claim
      where exists (
          select 1
          from credit_ledger
          where user_id = ${userId}
            and external_ref = ${debit.intentRef}
            and kind = 'adjustment'
            and amount = 0
            and project_id is not distinct from ${projectId}
            and run_id is not distinct from ${runId}
      )
        and not exists (
          select 1
          from credit_ledger
          where external_ref in (
            ${settledIntentRef},
            ${`intent-aborted:${debit.intentRef}`}
          )
        )
        and not exists (select 1 from existing_usage)
        and not exists (select 1 from usage_conflict)
        and (select credits from required_debit) <= claim.authorized
    ),
    usage_insert as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id,
        external_ref, metered_usd
      )
      select usage_values.*
      from usage_values
      cross join authorized_settlement
      where not exists (select 1 from existing_usage)
      on conflict (external_ref) do nothing
      returning id, amount
    ),
    call_insert as (
      insert into llm_calls (
        user_id, project_id, run_id, agent_role, operation, model,
        input_tokens, output_tokens, cached_input_tokens, reasoning_tokens,
        usd, latency_ms
      )
      select call_values.*
      from call_values
      cross join authorized_settlement
      where (select count(*) from usage_insert) = ${records.length}
      returning id
    ),
    release_insert as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${userId},
        authorized_settlement.authorized,
        'adjustment',
        'Release settled provider-call claim',
        ${records[0].projectId ?? null},
        ${records[0].runId ?? null},
        ${releaseRef}
      from authorized_settlement
      where (select count(*) from usage_insert) = ${records.length}
        and (select count(*) from call_insert) = ${records.length}
      on conflict (external_ref) do nothing
      returning id
    ),
    settled_intent as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${userId},
        0,
        'adjustment',
        'Provider result settled',
        ${records[0].projectId ?? null},
        ${records[0].runId ?? null},
        ${settledIntentRef}
      from release_insert
      on conflict (external_ref) do nothing
      returning id
    ),
    existing_delivery_refund as materialized (
      select id
      from credit_ledger
      where user_id = ${userId}
        and external_ref = ${deliveryRefundRef}
        and kind = 'adjustment'
        and amount > 0
        and project_id is not distinct from ${projectId}
        and run_id is not distinct from ${runId}
      limit 1
    ),
    delivery_refund as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${userId},
        (select sum(-amount) from usage_insert),
        'adjustment',
        ${debit.compensateDelivery?.description ?? null},
        ${projectId},
        ${runId},
        ${deliveryRefundRef}
      from settled_intent
      where ${debit.compensateDelivery?.description ?? null}::text is not null
        and exists (select 1 from usage_insert)
      on conflict (external_ref) do nothing
      returning id
    ),
    parent_transfer as materialized (
      select transferred.external_ref, transferred.amount
      from credit_ledger transferred
      inner join credit_ledger parent
        on parent.user_id = transferred.user_id
        and transferred.external_ref =
          'reservation-claim-release:' || parent.external_ref || ':' || ${debit.intentRef}
        and parent.kind = 'adjustment'
        and parent.amount < 0
        and parent.project_id is not distinct from transferred.project_id
        and parent.run_id is not distinct from transferred.run_id
      where transferred.user_id = ${userId}
        and transferred.kind = 'adjustment'
        and transferred.amount > 0
        and transferred.project_id is not distinct from ${projectId}
        and transferred.run_id is not distinct from ${runId}
        and not exists (
          select 1
          from credit_ledger parent_release
          where parent_release.external_ref = 'release:' || parent.external_ref
        )
      limit 1
    ),
    compensated_parent_restore as (
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      select
        ${userId},
        -parent_transfer.amount,
        'adjustment',
        'Restore phase capacity after compensated delivery',
        ${projectId},
        ${runId},
        parent_transfer.external_ref || ':delivery-restore'
      from parent_transfer, delivery_refund
      on conflict (external_ref) do nothing
      returning id
    )
    select
      (
        (
          exists (select 1 from settled_intent)
          and (
            ${debit.compensateDelivery?.description ?? null}::text is null
            or exists (select 1 from delivery_refund)
          )
        )
        or (
          exists (select 1 from existing_settlement)
          and (select count(*) from existing_usage) = ${records.length}
          and (
            ${debit.compensateDelivery?.description ?? null}::text is null
            or exists (select 1 from existing_delivery_refund)
          )
        )
      ) as recorded,
      coalesce((select authorized::text from claim), '0') as authorized,
      (select credits::text from required_debit) as required,
      coalesce(
        (select sum(-amount)::text from usage_insert),
        (
          select sum(-amount)::text
          from existing_usage
          where exists (select 1 from existing_settlement)
        ),
        '0'
      ) as debited_credits
  `,
  ]);
  const settled = (
    result as Array<{
      recorded: boolean;
      authorized: string;
      required: string;
      debited_credits: string;
    }>
  )[0];
  if (!settled?.recorded) {
    const authorized = Number(settled?.authorized ?? 0);
    const required = Number(settled?.required ?? 0);
    throw new ReservationSettlementError(authorized, Math.max(0, required - authorized));
  }
  await invalidateSpendCache(userId);
  return {
    meteredUsd: totalUsd,
    debitedCredits: Number(settled.debited_credits),
  };
}

export async function recordLlmCallAndDebit(
  record: LlmCallRecord,
  debit: MeteredLedgerDebit,
): Promise<MeteredSettlement> {
  return recordLlmCallsAndDebit([record], debit);
}

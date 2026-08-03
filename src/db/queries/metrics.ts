import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";

/**
 * Business metrics.
 *
 * Split from admin.ts because these answer a different question: admin.ts is
 * "what is this user/book/run doing", this is "is the business working".
 *
 * Almost everything here comes from tables that already existed — signups,
 * projects, runs and the ledger all leave durable rows, so the funnel was
 * always computable and simply never computed. analytics_events contributes
 * exactly one thing: wizard drop-off, which has no row behind it.
 *
 * Money always comes from credit_ledger. Never from analytics_events, which is
 * client-reported and allowed to be lossy.
 */

/** Every function guards; these are cross-user reads by definition. */

export type FunnelStage = {
  stage: string;
  count: number;
  /** Share of the stage above it — where people actually fall out. */
  conversionFromPrevious: number | null;
  /** Median days from signup, for the stages where that means something. */
  medianDaysFromSignup: number | null;
};

/**
 * Signup → first book started → first book finished → first purchase.
 *
 * Computed per user rather than per event, so "started a book" counts people,
 * not projects — a single enthusiast with nine drafts is one converted user.
 */
export async function getAcquisitionFunnel(): Promise<FunnelStage[]> {
  await requireAdmin();
  const { rows } = await getDb().execute<{
    signups: number;
    started: number;
    finished: number;
    purchased: number;
    median_days_to_start: number | null;
    median_days_to_finish: number | null;
    median_days_to_purchase: number | null;
  }>(sql`
    with milestones as (
      select
        u.id,
        u.created_at as signed_up,
        (select min(p.created_at) from projects p where p.user_id = u.id) as first_project,
        (select min(p.completed_at) from projects p where p.user_id = u.id) as first_complete,
        (select min(l.created_at) from credit_ledger l
           where l.user_id = u.id and l.kind = 'purchase') as first_purchase
      from users u
      where u.role <> 'admin'
    )
    select
      count(*)::int as signups,
      count(first_project)::int as started,
      count(first_complete)::int as finished,
      count(first_purchase)::int as purchased,
      percentile_cont(0.5) within group (
        order by extract(epoch from (first_project - signed_up)) / 86400
      ) filter (where first_project is not null) as median_days_to_start,
      percentile_cont(0.5) within group (
        order by extract(epoch from (first_complete - signed_up)) / 86400
      ) filter (where first_complete is not null) as median_days_to_finish,
      percentile_cont(0.5) within group (
        order by extract(epoch from (first_purchase - signed_up)) / 86400
      ) filter (where first_purchase is not null) as median_days_to_purchase
    from milestones
  `);

  const r = rows[0] ?? {
    signups: 0,
    started: 0,
    finished: 0,
    purchased: 0,
    median_days_to_start: null,
    median_days_to_finish: null,
    median_days_to_purchase: null,
  };

  const share = (n: number, of: number) => (of > 0 ? n / of : null);

  return [
    {
      stage: "Signed up",
      count: r.signups,
      conversionFromPrevious: null,
      medianDaysFromSignup: null,
    },
    {
      stage: "Started a book",
      count: r.started,
      conversionFromPrevious: share(r.started, r.signups),
      medianDaysFromSignup: r.median_days_to_start,
    },
    {
      stage: "Finished a book",
      count: r.finished,
      conversionFromPrevious: share(r.finished, r.started),
      medianDaysFromSignup: r.median_days_to_finish,
    },
    {
      stage: "Bought credits",
      count: r.purchased,
      conversionFromPrevious: share(r.purchased, r.finished),
      medianDaysFromSignup: r.median_days_to_purchase,
    },
  ];
}

/**
 * Revenue against cost of goods, by week.
 *
 * Revenue is usd_paid, not credits — bonus tiers mean credits overstate what
 * was collected. COGS is metered LLM spend. The gap between them is the actual
 * business.
 */
export async function getWeeklyEconomics() {
  await requireAdmin();
  const { rows } = await getDb().execute<{
    week: string;
    revenue_usd: number;
    cogs_usd: number;
    signups: number;
    books_finished: number;
  }>(sql`
    with weeks as (
      select generate_series(
        date_trunc('week', now()) - interval '11 weeks',
        date_trunc('week', now()),
        interval '1 week'
      ) as week
    )
    select
      to_char(w.week, 'YYYY-MM-DD') as week,
      coalesce((select sum(l.usd_paid) from credit_ledger l
        where date_trunc('week', l.created_at) = w.week
          and l.kind in ('purchase', 'refund')), 0)::float8 as revenue_usd,
      coalesce((select sum(c.usd) from llm_calls c
        where date_trunc('week', c.created_at) = w.week), 0)::float8 as cogs_usd,
      (select count(*) from users u
        where date_trunc('week', u.created_at) = w.week)::int as signups,
      (select count(*) from projects p
        where date_trunc('week', p.completed_at) = w.week)::int as books_finished
    from weeks w
    order by w.week
  `);
  return rows;
}

/**
 * Where paying customers came from. The reason users.acquisition exists.
 *
 * Per-user CTE first, then aggregate. Correlating the revenue subquery against
 * u.id directly in a GROUP BY channel select is invalid — Postgres rejects the
 * ungrouped outer column — which is the kind of thing a typecheck cannot catch
 * and only running it does.
 */
export async function getAcquisitionChannels() {
  await requireAdmin();
  const { rows } = await getDb().execute<{
    channel: string;
    users: number;
    payers: number;
    revenue_usd: number;
  }>(sql`
    with attributed as (
      select
        coalesce(
          u.acquisition->>'source',
          u.acquisition->>'referrerHost',
          'direct'
        ) as channel,
        exists (
          select 1 from credit_ledger l where l.user_id = u.id and l.kind = 'purchase'
        ) as paid,
        coalesce((select sum(l.usd_paid) from credit_ledger l
          where l.user_id = u.id and l.kind in ('purchase', 'refund')), 0) as revenue
      from users u
      where u.role <> 'admin'
    )
    select
      channel,
      count(*)::int as users,
      count(*) filter (where paid)::int as payers,
      coalesce(sum(revenue), 0)::float8 as revenue_usd
    from attributed
    group by channel
    order by revenue_usd desc, users desc
    limit 20
  `);
  return rows;
}

/**
 * Wizard drop-off. The one metric that needs analytics_events: the draft lives
 * in localStorage until submit, so an author who quits on step three leaves no
 * trace in any other table.
 */
export async function getWizardFunnel() {
  await requireAdmin();
  const { rows } = await getDb().execute<{ step_id: string; step: number; reached: number }>(sql`
    select
      props->>'stepId' as step_id,
      coalesce((props->>'step')::int, 0) as step,
      count(distinct coalesce(user_id, anon_id))::int as reached
    from analytics_events
    where name = 'wizard_step' and created_at >= now() - interval '30 days'
    group by 1, 2
    order by 2
  `);
  return rows;
}

/** Repeat purchase, genre mix, tier mix, run reliability — the operating picture. */
export async function getProductMetrics() {
  await requireAdmin();
  const db = getDb();

  const [repeat, genres, tiers, runs] = await Promise.all([
    db.execute<{ buyers: number; repeat_buyers: number; avg_purchases: number }>(sql`
      with per_user as (
        select user_id, count(*)::int as purchases
        from credit_ledger where kind = 'purchase' group by user_id
      )
      select
        count(*)::int as buyers,
        count(*) filter (where purchases > 1)::int as repeat_buyers,
        coalesce(avg(purchases), 0)::float8 as avg_purchases
      from per_user
    `),
    db.execute<{ genre: string; books: number; finished: number }>(sql`
      select
        coalesce(genre, 'unspecified') as genre,
        count(*)::int as books,
        count(completed_at)::int as finished
      from projects group by 1 order by books desc limit 12
    `),
    db.execute<{ tier: string; runs: number }>(sql`
      select coalesce(config->>'tier', 'unknown') as tier, count(*)::int as runs
      from generation_runs where kind = 'full_book' group by 1 order by runs desc
    `),
    db.execute<{
      total: number;
      completed: number;
      failed: number;
      median_minutes: number | null;
    }>(sql`
      select
        count(*)::int as total,
        count(*) filter (where status = 'completed')::int as completed,
        count(*) filter (where status = 'failed')::int as failed,
        percentile_cont(0.5) within group (
          order by extract(epoch from (completed_at - started_at)) / 60
        ) filter (where status = 'completed' and started_at is not null) as median_minutes
      from generation_runs where kind = 'full_book'
    `),
  ]);

  return {
    repeat: repeat.rows[0] ?? { buyers: 0, repeat_buyers: 0, avg_purchases: 0 },
    genres: genres.rows,
    tiers: tiers.rows,
    runs: runs.rows[0] ?? { total: 0, completed: 0, failed: 0, median_minutes: null },
  };
}

export type AuthoringOperationsMetrics = {
  firstAuthoringEvent: {
    sample: number;
    medianSeconds: number | null;
    p95Seconds: number | null;
  };
  actionWaits: {
    count: number;
    medianHours: number | null;
    oldestHours: number | null;
  };
  anomalies: {
    count: number;
    medianHours: number | null;
    oldestHours: number | null;
  };
  redispatch: {
    attempts: number;
    recovered: number;
    rate: number | null;
  };
  recovery: {
    attempts: number;
    completed: number;
    rate: number | null;
  };
  staleHolds: {
    count: number;
    credits: number;
    oldestHours: number | null;
  };
  trialConversion: {
    completedTrials: number;
    purchasers: number;
    rate: number | null;
  };
};

type AuthoringOperationsRow = {
  firstEventSample: number | string;
  firstEventMedianSeconds: number | string | null;
  firstEventP95Seconds: number | string | null;
  actionWaitCount: number | string;
  actionWaitMedianHours: number | string | null;
  actionWaitOldestHours: number | string | null;
  anomalyCount: number | string;
  anomalyMedianHours: number | string | null;
  anomalyOldestHours: number | string | null;
  redispatchAttempts: number | string;
  redispatchRecovered: number | string;
  recoveryAttempts: number | string;
  recoveryCompleted: number | string;
  staleHoldCount: number | string;
  staleHoldCredits: number | string;
  staleHoldOldestHours: number | string | null;
  completedTrials: number | string;
  trialPurchasers: number | string;
};

const numeric = (value: number | string | null | undefined): number => Number(value ?? 0);
const nullableNumeric = (value: number | string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);
const ratio = (value: number, total: number): number | null => (total > 0 ? value / total : null);

export function normalizeAuthoringOperationsMetrics(
  row: AuthoringOperationsRow | undefined,
): AuthoringOperationsMetrics {
  const firstEventSample = numeric(row?.firstEventSample);
  const actionWaitCount = numeric(row?.actionWaitCount);
  const anomalyCount = numeric(row?.anomalyCount);
  const redispatchAttempts = numeric(row?.redispatchAttempts);
  const redispatchRecovered = numeric(row?.redispatchRecovered);
  const recoveryAttempts = numeric(row?.recoveryAttempts);
  const recoveryCompleted = numeric(row?.recoveryCompleted);
  const staleHoldCount = numeric(row?.staleHoldCount);
  const completedTrials = numeric(row?.completedTrials);
  const trialPurchasers = numeric(row?.trialPurchasers);

  return {
    firstAuthoringEvent: {
      sample: firstEventSample,
      medianSeconds: nullableNumeric(row?.firstEventMedianSeconds),
      p95Seconds: nullableNumeric(row?.firstEventP95Seconds),
    },
    actionWaits: {
      count: actionWaitCount,
      medianHours: nullableNumeric(row?.actionWaitMedianHours),
      oldestHours: nullableNumeric(row?.actionWaitOldestHours),
    },
    anomalies: {
      count: anomalyCount,
      medianHours: nullableNumeric(row?.anomalyMedianHours),
      oldestHours: nullableNumeric(row?.anomalyOldestHours),
    },
    redispatch: {
      attempts: redispatchAttempts,
      recovered: redispatchRecovered,
      rate: ratio(redispatchRecovered, redispatchAttempts),
    },
    recovery: {
      attempts: recoveryAttempts,
      completed: recoveryCompleted,
      rate: ratio(recoveryCompleted, recoveryAttempts),
    },
    staleHolds: {
      count: staleHoldCount,
      credits: numeric(row?.staleHoldCredits),
      oldestHours: nullableNumeric(row?.staleHoldOldestHours),
    },
    trialConversion: {
      completedTrials,
      purchasers: trialPurchasers,
      rate: ratio(trialPurchasers, completedTrials),
    },
  };
}

/**
 * Server-derived reliability and conversion metrics. All operational measures
 * use durable database evidence; no client analytics event can make a run look
 * healthier, recovered, or paid.
 */
export async function getAuthoringOperationsMetrics(): Promise<AuthoringOperationsMetrics> {
  await requireAdmin();
  const { rows } = await getDb().execute<AuthoringOperationsRow>(sql`
    with meaningful_first_events as (
      select
        run_id,
        min(created_at) as first_event_at
      from generation_events
      where type in ('agent', 'chapter', 'review', 'tool_mutation')
        or (type = 'stage' and payload->>'stage' <> 'queued')
      group by run_id
    ),
    first_event_latencies as (
      select extract(epoch from (event.first_event_at - run.created_at)) as seconds
      from generation_runs run
      inner join meaningful_first_events event on event.run_id = run.id
      where run.kind = 'full_book'
        and run.created_at >= now() - interval '30 days'
        and event.first_event_at >= run.created_at
    ),
    action_wait_ages as (
      select extract(
        epoch from (now() - coalesce(pause_registered_at, heartbeat_at, created_at))
      ) / 3600 as hours
      from generation_runs
      where status = 'awaiting_input'
    ),
    anomaly_ages as (
      select extract(epoch from (now() - first_observed_at)) / 3600 as hours
      from authoring_incidents
      where resolved_at is null
        and category <> 'operator_action'
    ),
    redispatch_runs as (
      select
        run.id,
        greatest(run.dispatch_attempts - 1, 0)::int as retry_attempts,
        (
          run.status in ('running', 'awaiting_input', 'completed')
          and exists (
            select 1
            from meaningful_first_events event
            where event.run_id = run.id
          )
        ) as recovered
      from generation_runs run
      where run.kind = 'full_book'
        and run.dispatch_attempts > 1
    ),
    recovery_runs as (
      select status
      from generation_runs
      where kind = 'full_book'
        and config->>'resumeFromRunId' is not null
    ),
    open_generation_holds as (
      select
        reservation.external_ref,
        reservation.created_at,
        run.status,
        run.completed_at,
        greatest(
          0,
          -reservation.amount - coalesce((
            select sum(claimed.amount)
            from credit_ledger claimed
            where claimed.user_id = reservation.user_id
              and claimed.external_ref like
                ('reservation-claim-release:' || reservation.external_ref || ':%')
          ), 0)
        ) as remaining
      from credit_ledger reservation
      inner join generation_runs run on run.id = reservation.run_id
      where reservation.kind = 'adjustment'
        and reservation.amount < 0
        and reservation.external_ref like 'generation-reservation:%'
        and not exists (
          select 1
          from credit_ledger released
          where released.external_ref = 'release:' || reservation.external_ref
        )
    ),
    stale_generation_holds as (
      select
        remaining,
        extract(epoch from (now() - created_at)) / 3600 as hours
      from open_generation_holds
      where status in ('completed', 'failed', 'cancelled')
        and coalesce(completed_at, created_at) <= now() - interval '1 hour'
        and remaining > 0
    ),
    completed_trials as (
      select
        trial_project.user_id,
        min(trial_run.completed_at) as completed_at
      from projects trial_project
      inner join generation_runs trial_run
        on trial_run.project_id = trial_project.id
      cross join lateral (
        select case
          when trial_run.config->>'targetChapters' ~ '^[1-9][0-9]*$'
            then (trial_run.config->>'targetChapters')::int
          else trial_project.target_chapters
        end as expected_chapters
      ) expectation
      where trial_project.experience = 'trial_short_story'
        and trial_project.completed_at is not null
        and trial_run.kind = 'full_book'
        and trial_run.status = 'completed'
        and coalesce(
          trial_run.config #>> '{completion,finalized,sourceRunId}',
          ''
        ) = trial_run.id::text
        and length(
          btrim(coalesce(
            trial_run.config #>> '{completion,finalized,manuscriptDigest}',
            ''
          ))
        ) > 0
        and (
          select count(*)::int
          from chapters trial_chapter
          inner join books trial_book
            on trial_book.id = trial_chapter.book_id
          where trial_book.project_id = trial_project.id
            and trial_chapter.chapter_number
              between 1 and expectation.expected_chapters
            and trial_chapter.status = 'final'
            and length(btrim(trial_chapter.content)) > 0
        ) >= expectation.expected_chapters
      group by trial_project.user_id
    ),
    trial_conversions as (
      select
        trial.user_id,
        exists (
          select 1
          from credit_ledger purchase
          where purchase.user_id = trial.user_id
            and purchase.kind = 'purchase'
            and purchase.amount > 0
            and purchase.created_at >= trial.completed_at
        ) as purchased
      from completed_trials trial
    )
    select
      (select count(*)::int from first_event_latencies) as "firstEventSample",
      (select percentile_cont(0.5) within group (order by seconds)
        from first_event_latencies) as "firstEventMedianSeconds",
      (select percentile_cont(0.95) within group (order by seconds)
        from first_event_latencies) as "firstEventP95Seconds",
      (select count(*)::int from action_wait_ages) as "actionWaitCount",
      (select percentile_cont(0.5) within group (order by hours)
        from action_wait_ages) as "actionWaitMedianHours",
      (select max(hours) from action_wait_ages) as "actionWaitOldestHours",
      (select count(*)::int from anomaly_ages) as "anomalyCount",
      (select percentile_cont(0.5) within group (order by hours)
        from anomaly_ages) as "anomalyMedianHours",
      (select max(hours) from anomaly_ages) as "anomalyOldestHours",
      (select coalesce(sum(retry_attempts), 0)::int
        from redispatch_runs) as "redispatchAttempts",
      (select count(*) filter (where recovered)::int
        from redispatch_runs) as "redispatchRecovered",
      (select count(*)::int from recovery_runs) as "recoveryAttempts",
      (select count(*) filter (where status = 'completed')::int
        from recovery_runs) as "recoveryCompleted",
      (select count(*)::int from stale_generation_holds) as "staleHoldCount",
      (select coalesce(sum(remaining), 0)::float8
        from stale_generation_holds) as "staleHoldCredits",
      (select max(hours) from stale_generation_holds) as "staleHoldOldestHours",
      (select count(*)::int from trial_conversions) as "completedTrials",
      (select count(*) filter (where purchased)::int
        from trial_conversions) as "trialPurchasers"
  `);

  return normalizeAuthoringOperationsMetrics(rows[0]);
}

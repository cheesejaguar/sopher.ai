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

/** Where paying customers came from. The reason users.acquisition exists. */
export async function getAcquisitionChannels() {
  await requireAdmin();
  const { rows } = await getDb().execute<{
    channel: string;
    users: number;
    payers: number;
    revenue_usd: number;
  }>(sql`
    select
      coalesce(
        u.acquisition->>'source',
        u.acquisition->>'referrerHost',
        'direct'
      ) as channel,
      count(*)::int as users,
      count(*) filter (where exists (
        select 1 from credit_ledger l where l.user_id = u.id and l.kind = 'purchase'
      ))::int as payers,
      coalesce((select sum(l.usd_paid) from credit_ledger l
        where l.user_id = u.id and l.kind in ('purchase', 'refund')), 0)::float8 as revenue_usd
    from users u
    where u.role <> 'admin'
    group by 1
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

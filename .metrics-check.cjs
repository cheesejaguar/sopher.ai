// Read-only verification that the hand-written metrics SQL runs and returns
// sane numbers against real production data. SELECT only.
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

(async () => {
  console.log("--- acquisition funnel ---");
  console.log(
    await sql`
    with milestones as (
      select u.id, u.created_at as signed_up,
        (select min(p.created_at) from projects p where p.user_id = u.id) as first_project,
        (select min(p.completed_at) from projects p where p.user_id = u.id) as first_complete,
        (select min(l.created_at) from credit_ledger l where l.user_id = u.id and l.kind='purchase') as first_purchase
      from users u where u.role <> 'admin'
    )
    select count(*)::int as signups, count(first_project)::int as started,
      count(first_complete)::int as finished, count(first_purchase)::int as purchased,
      percentile_cont(0.5) within group (order by extract(epoch from (first_project - signed_up))/86400)
        filter (where first_project is not null) as median_days_to_start
    from milestones`,
  );

  console.log("--- weekly economics (last 3 non-zero) ---");
  const weeks = await sql`
    with weeks as (select generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as week)
    select to_char(w.week,'YYYY-MM-DD') as week,
      coalesce((select sum(l.usd_paid) from credit_ledger l where date_trunc('week', l.created_at)=w.week and l.kind in ('purchase','refund')),0)::float8 as revenue_usd,
      coalesce((select sum(c.usd) from llm_calls c where date_trunc('week', c.created_at)=w.week),0)::float8 as cogs_usd,
      (select count(*) from users u where date_trunc('week', u.created_at)=w.week)::int as signups,
      (select count(*) from projects p where date_trunc('week', p.completed_at)=w.week)::int as books_finished
    from weeks w order by w.week`;
  console.log(weeks.filter((w) => w.revenue_usd || w.cogs_usd || w.signups || w.books_finished));

  console.log("--- channels ---");
  console.log(
    await sql`
    with attributed as (
      select coalesce(u.acquisition->>'source', u.acquisition->>'referrerHost', 'direct') as channel,
        exists (select 1 from credit_ledger l where l.user_id=u.id and l.kind='purchase') as paid,
        coalesce((select sum(l.usd_paid) from credit_ledger l where l.user_id=u.id and l.kind in ('purchase','refund')),0) as revenue
      from users u where u.role <> 'admin'
    )
    select channel, count(*)::int as users, count(*) filter (where paid)::int as payers,
      coalesce(sum(revenue),0)::float8 as revenue_usd
    from attributed group by channel order by revenue_usd desc, users desc limit 20`,
  );

  console.log("--- product metrics ---");
  console.log(
    "repeat:",
    await sql`with per_user as (select user_id, count(*)::int as purchases from credit_ledger where kind='purchase' group by user_id)
      select count(*)::int as buyers, count(*) filter (where purchases>1)::int as repeat_buyers, coalesce(avg(purchases),0)::float8 as avg_purchases from per_user`,
  );
  console.log(
    "runs:",
    await sql`select count(*)::int as total, count(*) filter (where status='completed')::int as completed,
      count(*) filter (where status='failed')::int as failed,
      percentile_cont(0.5) within group (order by extract(epoch from (completed_at - started_at))/60)
        filter (where status='completed' and started_at is not null) as median_minutes
      from generation_runs where kind='full_book'`,
  );
  console.log(
    "genres:",
    await sql`select coalesce(genre,'unspecified') as genre, count(*)::int as books, count(completed_at)::int as finished from projects group by 1 order by books desc limit 12`,
  );
  console.log(
    "tiers:",
    await sql`select coalesce(config->>'tier','unknown') as tier, count(*)::int as runs from generation_runs where kind='full_book' group by 1 order by runs desc`,
  );

  console.log("--- wizard funnel ---");
  console.log(
    await sql`
    select props->>'stepId' as step_id, coalesce((props->>'step')::int,0) as step,
      count(distinct coalesce(user_id, anon_id))::int as reached
    from analytics_events where name='wizard_step' and created_at >= now() - interval '30 days'
    group by 1,2 order by 2`,
  );

  console.log("--- revenue: usd_paid backfill vs credits (the bug) ---");
  console.log(
    await sql`
    select kind, count(*)::int as rows, sum(amount)::float8 as credits, sum(usd_paid)::float8 as usd_paid
    from credit_ledger where kind in ('purchase','refund') group by kind`,
  );
})();

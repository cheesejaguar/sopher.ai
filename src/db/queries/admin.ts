import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";

/**
 * Admin aggregates. Every function here reads across ALL users by design, so
 * every one of them calls requireAdmin() itself rather than trusting the
 * layout to have done it. Layout-only auth is the pattern Next and Clerk both
 * warn against under PPR — a page that renders before its layout's guard
 * resolves would otherwise leak. Single-pass SQL, no N+1.
 */

// Time cutoffs live in SQL: cacheComponents forbids Date.now() in a server
// component before its first uncached data access.
const weekAgoSql = sql`now() - interval '7 days'`;

export async function getOverviewKpis() {
  await requireAdmin();
  const db = getDb();

  const [users, books, money, runs, flags] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        new7d: sql<number>`count(*) filter (where ${schema.users.createdAt} >= ${weekAgoSql})::int`,
        suspended: sql<number>`count(*) filter (where ${schema.users.suspended})::int`,
      })
      .from(schema.users),
    db
      .select({
        total: sql<number>`count(*)::int`,
        // completed_at, not status='complete' + updated_at: the workflow moves a
        // finished book to 'editing' (authors edit next), so the old filter
        // counted almost nothing, and updated_at moved on every later edit.
        completed7d: sql<number>`count(*) filter (where ${schema.projects.completedAt} >= ${weekAgoSql})::int`,
        words: sql<number>`coalesce((select sum(c.word_count) from chapters c), 0)::bigint`,
      })
      .from(schema.projects),
    db
      .select({
        // Revenue = dollars Stripe actually collected, net of refunds. Was
        // summing purchase CREDITS, which overstated by the bonus on every
        // tier above Starter ($60 buys 66 credits).
        revenueUsd: sql<string>`coalesce(sum(${schema.creditLedger.usdPaid}) filter (where ${schema.creditLedger.kind} in ('purchase', 'refund')), 0)`,
        // Liability = what the ledger still owes users in work.
        liabilityCredits: sql<string>`coalesce(sum(${schema.creditLedger.amount}), 0)`,
        grantedCredits: sql<string>`coalesce(sum(${schema.creditLedger.amount}) filter (where ${schema.creditLedger.kind} in ('grant', 'adjustment')), 0)`,
      })
      .from(schema.creditLedger),
    db
      .select({
        active: sql<number>`count(*) filter (where ${schema.generationRuns.status} in ('queued','running','awaiting_input'))::int`,
        failed7d: sql<number>`count(*) filter (where ${schema.generationRuns.status} = 'failed' and ${schema.generationRuns.createdAt} >= ${weekAgoSql})::int`,
      })
      .from(schema.generationRuns),
    db
      .select({
        open: sql<number>`count(*) filter (where ${schema.moderationFlags.status} = 'open')::int`,
      })
      .from(schema.moderationFlags),
  ]);

  const [cogs] = await getDb()
    .select({ usd: sql<string>`coalesce(sum(${schema.llmCalls.usd}), 0)` })
    .from(schema.llmCalls);

  return {
    users: users[0],
    books: books[0],
    money: {
      revenueUsd: Number(money[0].revenueUsd),
      liabilityCredits: Number(money[0].liabilityCredits),
      grantedCredits: Number(money[0].grantedCredits),
      cogsUsd: Number(cogs.usd),
    },
    runs: runs[0],
    flags: flags[0],
  };
}

export async function listUsersWithStats() {
  await requireAdmin();
  const db = getDb();
  const users = await db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
  if (users.length === 0) return [];
  const ids = users.map((u) => u.id);

  const [balances, spends, projects] = await Promise.all([
    db
      .select({
        userId: schema.creditLedger.userId,
        balance: sql<string>`coalesce(sum(${schema.creditLedger.amount}), 0)`,
      })
      .from(schema.creditLedger)
      .where(inArray(schema.creditLedger.userId, ids))
      .groupBy(schema.creditLedger.userId),
    db
      .select({
        userId: schema.llmCalls.userId,
        usd: sql<string>`coalesce(sum(${schema.llmCalls.usd}), 0)`,
        lastAt: sql<string>`max(${schema.llmCalls.createdAt})`,
      })
      .from(schema.llmCalls)
      .where(inArray(schema.llmCalls.userId, ids))
      .groupBy(schema.llmCalls.userId),
    db
      .select({
        userId: schema.projects.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.projects)
      .where(inArray(schema.projects.userId, ids))
      .groupBy(schema.projects.userId),
  ]);

  const byId = <T extends { userId: string }>(rows: T[]) => new Map(rows.map((r) => [r.userId, r]));
  const balanceMap = byId(balances);
  const spendMap = byId(spends);
  const projectMap = byId(projects);

  return users.map((user) => ({
    ...user,
    balance: Number(balanceMap.get(user.id)?.balance ?? 0),
    meteredUsd: Number(spendMap.get(user.id)?.usd ?? 0),
    lastActivity: spendMap.get(user.id)?.lastAt ?? null,
    projectCount: projectMap.get(user.id)?.count ?? 0,
  }));
}

export async function getUserDetail(userId: string) {
  await requireAdmin();
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) return null;

  const [ledger, balanceRow, projects, runs, callStats] = await Promise.all([
    db
      .select()
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.userId, userId))
      .orderBy(desc(schema.creditLedger.createdAt))
      .limit(50),
    // Balance over the WHOLE ledger — the 50-row page above is display only.
    db
      .select({ balance: sql<string>`coalesce(sum(${schema.creditLedger.amount}), 0)` })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.userId, userId)),
    db
      .select({
        id: schema.projects.id,
        title: schema.projects.title,
        genre: schema.projects.genre,
        status: schema.projects.status,
        updatedAt: schema.projects.updatedAt,
        words: sql<number>`coalesce((select sum(c.word_count) from chapters c join books b on b.id = c.book_id where b.project_id = "projects"."id"), 0)::int`,
      })
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    db
      .select()
      .from(schema.generationRuns)
      .where(eq(schema.generationRuns.userId, userId))
      .orderBy(desc(schema.generationRuns.createdAt))
      .limit(20),
    db
      .select({
        calls: sql<number>`count(*)::int`,
        usd: sql<string>`coalesce(sum(${schema.llmCalls.usd}), 0)`,
      })
      .from(schema.llmCalls)
      .where(eq(schema.llmCalls.userId, userId)),
  ]);

  return {
    user,
    ledger,
    projects,
    runs,
    balance: Number(balanceRow[0]?.balance ?? 0),
    callStats: { calls: callStats[0].calls, usd: Number(callStats[0].usd) },
  };
}

export async function listPurchases() {
  await requireAdmin();
  const db = getDb();
  const [totals] = await db
    .select({
      purchased: sql<string>`coalesce(sum(${schema.creditLedger.amount}) filter (where ${schema.creditLedger.kind} = 'purchase'), 0)`,
    })
    .from(schema.creditLedger);
  const rows = await db
    .select({
      id: schema.creditLedger.id,
      createdAt: schema.creditLedger.createdAt,
      kind: schema.creditLedger.kind,
      amount: schema.creditLedger.amount,
      description: schema.creditLedger.description,
      externalRef: schema.creditLedger.externalRef,
      userId: schema.creditLedger.userId,
      email: schema.users.email,
    })
    .from(schema.creditLedger)
    .innerJoin(schema.users, eq(schema.users.id, schema.creditLedger.userId))
    .where(inArray(schema.creditLedger.kind, ["purchase", "refund", "adjustment"]))
    .orderBy(desc(schema.creditLedger.createdAt))
    .limit(200);
  return { rows, purchasedTotal: Number(totals.purchased) };
}

export async function listAllBooks() {
  await requireAdmin();
  const db = getDb();
  return db
    .select({
      projectId: schema.projects.id,
      title: schema.books.title,
      genre: schema.projects.genre,
      status: schema.projects.status,
      updatedAt: schema.projects.updatedAt,
      email: schema.users.email,
      userId: schema.users.id,
      words: sql<number>`coalesce((select sum(c.word_count) from chapters c where c.book_id = "books"."id"), 0)::int`,
      chapters: sql<number>`(select count(*)::int from chapters c where c.book_id = "books"."id")`,
      openFlags: sql<number>`(select count(*)::int from moderation_flags f where f.project_id = "projects"."id" and f.status = 'open')`,
    })
    .from(schema.books)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
    .orderBy(desc(schema.projects.updatedAt))
    .limit(200);
}

export async function listFlags(status?: "open" | "dismissed" | "actioned") {
  await requireAdmin();
  const db = getDb();
  return db
    .select({
      id: schema.moderationFlags.id,
      createdAt: schema.moderationFlags.createdAt,
      source: schema.moderationFlags.source,
      chapterNumber: schema.moderationFlags.chapterNumber,
      category: schema.moderationFlags.category,
      severity: schema.moderationFlags.severity,
      excerpt: schema.moderationFlags.excerpt,
      detail: schema.moderationFlags.detail,
      status: schema.moderationFlags.status,
      reviewedBy: schema.moderationFlags.reviewedBy,
      projectId: schema.moderationFlags.projectId,
      title: schema.projects.title,
      email: schema.users.email,
      userId: schema.users.id,
    })
    .from(schema.moderationFlags)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.moderationFlags.projectId))
    .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
    .where(status ? eq(schema.moderationFlags.status, status) : undefined)
    .orderBy(
      // urgent first within open; newest first otherwise
      sql`case when ${schema.moderationFlags.severity} = 'urgent' then 0 else 1 end`,
      desc(schema.moderationFlags.createdAt),
    )
    .limit(200);
}

const STUCK_AWAITING_MS = 24 * 3_600_000;
const STUCK_RUNNING_MS = 2 * 3_600_000;

export async function listRuns() {
  await requireAdmin();
  const db = getDb();
  const rows = await db
    .select({
      id: schema.generationRuns.id,
      createdAt: schema.generationRuns.createdAt,
      startedAt: schema.generationRuns.startedAt,
      kind: schema.generationRuns.kind,
      status: schema.generationRuns.status,
      error: schema.generationRuns.error,
      workflowRunId: schema.generationRuns.workflowRunId,
      projectId: schema.generationRuns.projectId,
      title: schema.projects.title,
      email: schema.users.email,
      userId: schema.users.id,
      usd: sql<string>`coalesce((select sum(l.usd) from llm_calls l where l.run_id = "generation_runs"."id"), 0)`,
    })
    .from(schema.generationRuns)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.generationRuns.projectId))
    .innerJoin(schema.users, eq(schema.users.id, schema.generationRuns.userId))
    .orderBy(desc(schema.generationRuns.createdAt))
    .limit(100);

  const now = Date.now();
  return rows.map((run) => {
    const since = new Date(run.startedAt ?? run.createdAt).getTime();
    return {
      ...run,
      usd: Number(run.usd),
      stuck:
        (run.status === "awaiting_input" && now - since > STUCK_AWAITING_MS) ||
        (run.status === "running" && now - since > STUCK_RUNNING_MS),
    };
  });
}

export async function getRunEvents(runId: string) {
  await requireAdmin();
  const db = getDb();
  const [run] = await db
    .select({
      id: schema.generationRuns.id,
      status: schema.generationRuns.status,
      kind: schema.generationRuns.kind,
      error: schema.generationRuns.error,
      workflowRunId: schema.generationRuns.workflowRunId,
      createdAt: schema.generationRuns.createdAt,
      title: schema.projects.title,
      email: schema.users.email,
      projectId: schema.projects.id,
    })
    .from(schema.generationRuns)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.generationRuns.projectId))
    .innerJoin(schema.users, eq(schema.users.id, schema.generationRuns.userId))
    .where(eq(schema.generationRuns.id, runId))
    .limit(1);
  if (!run) return null;

  const events = await db
    .select({
      seq: schema.generationEvents.seq,
      type: schema.generationEvents.type,
      payload: schema.generationEvents.payload,
      createdAt: schema.generationEvents.createdAt,
    })
    .from(schema.generationEvents)
    .where(eq(schema.generationEvents.runId, runId))
    .orderBy(schema.generationEvents.seq);

  return { run, events };
}

export async function getAdminBook(projectId: string) {
  await requireAdmin();
  const db = getDb();
  const [row] = await db
    .select({
      projectId: schema.projects.id,
      title: schema.books.title,
      synopsis: schema.books.synopsis,
      genre: schema.projects.genre,
      status: schema.projects.status,
      email: schema.users.email,
      userId: schema.users.id,
      bookId: schema.books.id,
    })
    .from(schema.projects)
    .innerJoin(schema.books, eq(schema.books.projectId, schema.projects.id))
    .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!row) return null;

  const [chapters, flags] = await Promise.all([
    db
      .select({
        id: schema.chapters.id,
        chapterNumber: schema.chapters.chapterNumber,
        title: schema.chapters.title,
        content: schema.chapters.content,
        wordCount: schema.chapters.wordCount,
      })
      .from(schema.chapters)
      .where(
        and(
          eq(schema.chapters.bookId, row.bookId),
          gte(sql`length(${schema.chapters.content})`, 1),
        ),
      )
      .orderBy(schema.chapters.chapterNumber)
      // A 60-chapter book at the 400k-char chapter cap is a 24 MB response
      // that then goes through markdownToHtml per chapter. Bounded.
      .limit(200),
    db
      .select()
      .from(schema.moderationFlags)
      .where(eq(schema.moderationFlags.projectId, projectId))
      .orderBy(desc(schema.moderationFlags.createdAt))
      .limit(100),
  ]);

  return { ...row, chapters, flags };
}

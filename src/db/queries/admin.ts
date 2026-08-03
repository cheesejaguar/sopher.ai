import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { recommendAdminRunAction, summarizeAdminRunCheckpoints } from "@/lib/admin/run-operations";
import { requireAdmin } from "@/lib/auth";
import { getRunHealth } from "@/lib/run-health";

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
      // The ask, not just the result — scanning the list for "what are people
      // actually writing" should not require opening every book.
      brief: sql<string | null>`left("projects"."brief", 180)`,
      tier: sql<string | null>`"projects"."settings"->>'qualityTier'`,
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
      rootErrorCode: schema.generationRuns.rootErrorCode,
      rootErrorStage: schema.generationRuns.rootErrorStage,
      workflowRunId: schema.generationRuns.workflowRunId,
      workflowStatus: schema.generationRuns.workflowObservedStatus,
      workflowObservedAt: schema.generationRuns.workflowObservedAt,
      currentStage: schema.generationRuns.currentStage,
      progressPct: schema.generationRuns.progressPct,
      lastProgressAt: schema.generationRuns.lastProgressAt,
      heartbeatAt: schema.generationRuns.heartbeatAt,
      pauseKind: schema.generationRuns.pauseKind,
      pauseVersion: schema.generationRuns.pauseVersion,
      cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
      dispatchAttempts: schema.generationRuns.dispatchAttempts,
      supportReference: schema.generationRuns.supportReference,
      projectId: schema.generationRuns.projectId,
      title: schema.projects.title,
      email: schema.users.email,
      userId: schema.users.id,
      usd: sql<string>`coalesce((select sum(l.usd) from llm_calls l where l.run_id = "generation_runs"."id"), 0)`,
      lastEventAt: sql<Date | null>`(
        select max(e.created_at)
        from generation_events e
        where e.run_id = "generation_runs"."id"
      )`,
      incidentSeverity: sql<"warning" | "critical" | null>`(
        select case
          when bool_or(i.severity = 'critical') then 'critical'
          when count(*) > 0 then 'warning'
          else null
        end
        from authoring_incidents i
        where i.run_id = "generation_runs"."id"
          and i.resolved_at is null
      )`,
      incidentCategories: sql<string | null>`(
        select string_agg(distinct i.category, ', ' order by i.category)
        from authoring_incidents i
        where i.run_id = "generation_runs"."id"
          and i.resolved_at is null
      )`,
    })
    .from(schema.generationRuns)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.generationRuns.projectId))
    .innerJoin(schema.users, eq(schema.users.id, schema.generationRuns.userId))
    .orderBy(desc(schema.generationRuns.createdAt))
    .limit(100);

  return rows.map((run) => {
    const active = ["queued", "running", "awaiting_input"].includes(run.status);
    const health =
      run.incidentSeverity ??
      (run.cancellationRequestedAt
        ? "waiting"
        : active
          ? run.status === "awaiting_input"
            ? "waiting"
            : "healthy"
          : "terminal");
    return {
      ...run,
      usd: Number(run.usd),
      health,
      stuck: run.incidentSeverity === "warning" || run.incidentSeverity === "critical",
    };
  });
}

export async function listUnresolvedMeteringIntents() {
  await requireAdmin();
  const { rows } = await getDb().execute<{
    intentRef: string;
    userId: string;
    email: string;
    projectId: string | null;
    projectTitle: string | null;
    runId: string | null;
    description: string;
    heldCredits: string;
    createdAt: Date;
  }>(sql`
    select
      intent.external_ref as "intentRef",
      intent.user_id as "userId",
      users.email,
      intent.project_id as "projectId",
      projects.title as "projectTitle",
      intent.run_id as "runId",
      intent.description,
      (-claim.amount)::text as "heldCredits",
      intent.created_at as "createdAt"
    from ${schema.creditLedger} intent
    inner join ${schema.creditLedger} claim
      on claim.external_ref = 'metering-claim:' || intent.external_ref
      and claim.user_id = intent.user_id
      and claim.kind = 'adjustment'
      and claim.amount < 0
    inner join ${schema.users} users on users.id = intent.user_id
    left join ${schema.projects} projects on projects.id = intent.project_id
    where intent.kind = 'adjustment'
      and intent.amount = 0
      and intent.external_ref like 'metering-intent:%'
      and intent.created_at <= now() - interval '1 hour'
      and not exists (
        select 1
        from ${schema.creditLedger} terminal
        where terminal.external_ref in (
          'intent-settled:' || intent.external_ref,
          'intent-aborted:' || intent.external_ref
        )
      )
      and not exists (
        select 1
        from ${schema.creditLedger} released
        where released.external_ref = 'release:metering-claim:' || intent.external_ref
      )
    order by intent.created_at asc
    limit 100
  `);
  return rows.map((row) => ({ ...row, heldCredits: Number(row.heldCredits) }));
}

export async function getRunEvents(runId: string) {
  await requireAdmin();
  const db = getDb();
  const [runRow] = await db
    .select()
    .from(schema.generationRuns)
    .where(eq(schema.generationRuns.id, runId))
    .limit(1);
  if (!runRow) return null;

  const [identity] = await db
    .select({
      title: schema.projects.title,
      email: schema.users.email,
    })
    .from(schema.projects)
    .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
    .where(eq(schema.projects.id, runRow.projectId))
    .limit(1);
  if (!identity) return null;

  const [events, incidents, inputs, artifactResult, holdResult, health] = await Promise.all([
    db
      .select({
        seq: schema.generationEvents.seq,
        eventKey: schema.generationEvents.eventKey,
        type: schema.generationEvents.type,
        payload: schema.generationEvents.payload,
        createdAt: schema.generationEvents.createdAt,
      })
      .from(schema.generationEvents)
      .where(eq(schema.generationEvents.runId, runId))
      .orderBy(schema.generationEvents.seq),
    db
      .select({
        id: schema.authoringIncidents.id,
        category: schema.authoringIncidents.category,
        severity: schema.authoringIncidents.severity,
        evidence: schema.authoringIncidents.evidence,
        occurrenceCount: schema.authoringIncidents.occurrenceCount,
        firstObservedAt: schema.authoringIncidents.firstObservedAt,
        lastObservedAt: schema.authoringIncidents.lastObservedAt,
        resolvedAt: schema.authoringIncidents.resolvedAt,
      })
      .from(schema.authoringIncidents)
      .where(eq(schema.authoringIncidents.runId, runId))
      .orderBy(desc(schema.authoringIncidents.lastObservedAt)),
    db
      .select({
        id: schema.authoringRunInputs.id,
        kind: schema.authoringRunInputs.kind,
        pauseVersion: schema.authoringRunInputs.pauseVersion,
        status: schema.authoringRunInputs.status,
        deliveryAttempts: schema.authoringRunInputs.deliveryAttempts,
        acceptedAt: schema.authoringRunInputs.acceptedAt,
        deliveredAt: schema.authoringRunInputs.deliveredAt,
        consumedAt: schema.authoringRunInputs.consumedAt,
        lastDeliveryError: schema.authoringRunInputs.lastDeliveryError,
      })
      .from(schema.authoringRunInputs)
      .where(eq(schema.authoringRunInputs.runId, runId))
      .orderBy(desc(schema.authoringRunInputs.acceptedAt)),
    db.execute<{
      outlineCount: number;
      chapterCount: number;
      contentChapterCount: number;
      finalChapterCount: number;
      entityCount: number;
      relationshipCount: number;
      assetCount: number;
      exportCount: number;
    }>(sql`
      with project_book as (
        select id
        from ${schema.books}
        where project_id = ${runRow.projectId}
        limit 1
      )
      select
        (select count(*)::int
          from ${schema.outlines}
          where book_id in (select id from project_book)) as "outlineCount",
        (select count(*)::int
          from ${schema.chapters}
          where book_id in (select id from project_book)) as "chapterCount",
        (select count(*)::int
          from ${schema.chapters}
          where book_id in (select id from project_book)
            and word_count > 0
            and length(btrim(content)) > 0) as "contentChapterCount",
        (select count(*)::int
          from ${schema.chapters}
          where book_id in (select id from project_book)
            and status = 'final'
            and word_count > 0
            and length(btrim(content)) > 0) as "finalChapterCount",
        (select count(*)::int
          from ${schema.entities}
          where book_id in (select id from project_book)) as "entityCount",
        (select count(*)::int
          from ${schema.entityRelationships} relationship
          where exists (
            select 1
            from ${schema.entities} source
            where source.id = relationship.from_entity_id
              and source.book_id in (select id from project_book)
          )) as "relationshipCount",
        (select count(*)::int
          from ${schema.assets}
          where project_id = ${runRow.projectId}) as "assetCount",
        (select count(*)::int
          from ${schema.assets}
          where project_id = ${runRow.projectId}
            and kind in ('export_epub', 'export_pdf', 'export_docx', 'export_md')) as "exportCount"
    `),
    db.execute<{
      externalRef: string;
      heldCredits: string;
      createdAt: Date;
    }>(sql`
      select
        reservation.external_ref as "externalRef",
        greatest(
          0,
          -reservation.amount - coalesce((
            select sum(claimed.amount)
            from ${schema.creditLedger} claimed
            where claimed.user_id = reservation.user_id
              and claimed.external_ref like
                ('reservation-claim-release:' || reservation.external_ref || ':%')
          ), 0)
        )::text as "heldCredits",
        reservation.created_at as "createdAt"
      from ${schema.creditLedger} reservation
      where reservation.run_id = ${runId}
        and reservation.kind = 'adjustment'
        and reservation.amount < 0
        and coalesce(reservation.external_ref, '') ~
          '^(generation-reservation:|interactive-reservation:)'
        and not exists (
          select 1
          from ${schema.creditLedger} released
          where released.external_ref = 'release:' || reservation.external_ref
        )
      order by reservation.created_at asc
      limit 100
    `),
    getRunHealth(runRow),
  ]);

  const artifacts = artifactResult.rows[0] ?? {
    outlineCount: 0,
    chapterCount: 0,
    contentChapterCount: 0,
    finalChapterCount: 0,
    entityCount: 0,
    relationshipCount: 0,
    assetCount: 0,
    exportCount: 0,
  };
  const openHolds = holdResult.rows.map((hold) => ({
    ...hold,
    heldCredits: Number(hold.heldCredits),
  }));
  const recommendedAction = recommendAdminRunAction({
    health,
    acceptedInputCount: inputs.filter(
      (input) =>
        input.status === "accepted" &&
        input.kind === health.pause?.kind &&
        input.pauseVersion === health.pause.version,
    ).length,
    hasOpenCriticalIncident: incidents.some(
      (incident) => incident.severity === "critical" && !incident.resolvedAt,
    ),
  });

  return {
    run: { ...runRow, ...identity },
    health,
    checkpoints: summarizeAdminRunCheckpoints(runId, runRow.config),
    artifacts,
    credit: {
      ...health.spend,
      openHolds,
      openHeldCredits: openHolds.reduce((sum, hold) => sum + hold.heldCredits, 0),
    },
    recommendedAction,
    events,
    incidents,
    inputs,
  };
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
      // Everything the author actually typed or chose. All of this was already
      // in the database and none of it was ever shown — an admin could read a
      // whole manuscript but not the one-line brief that asked for it.
      brief: schema.projects.brief,
      subgenre: schema.projects.subgenre,
      protagonist: schema.projects.protagonist,
      setting: schema.projects.setting,
      styleGuide: schema.projects.styleGuide,
      settings: schema.projects.settings,
      targetChapters: schema.projects.targetChapters,
      targetWordsPerChapter: schema.projects.targetWordsPerChapter,
      concept: schema.books.concept,
      createdAt: schema.projects.createdAt,
      completedAt: schema.projects.completedAt,
    })
    .from(schema.projects)
    .innerJoin(schema.books, eq(schema.books.projectId, schema.projects.id))
    .innerJoin(schema.users, eq(schema.users.id, schema.projects.userId))
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!row) return null;

  const [chapters, flags, outlines, runs, instructions, toolRuns] = await Promise.all([
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
    // The outline the author saw and, where they edited it, the version they
    // wrote themselves.
    db
      .select({
        version: schema.outlines.version,
        source: schema.outlines.source,
        content: schema.outlines.content,
        createdAt: schema.outlines.createdAt,
      })
      .from(schema.outlines)
      .where(eq(schema.outlines.bookId, row.bookId))
      .orderBy(schema.outlines.version)
      .limit(20),
    // Runs, for the tier as of each run and any outline revision notes.
    db
      .select({
        id: schema.generationRuns.id,
        kind: schema.generationRuns.kind,
        status: schema.generationRuns.status,
        config: schema.generationRuns.config,
        approvalNotes: schema.generationRuns.approvalNotes,
        createdAt: schema.generationRuns.createdAt,
      })
      .from(schema.generationRuns)
      .where(eq(schema.generationRuns.projectId, projectId))
      .orderBy(desc(schema.generationRuns.createdAt))
      .limit(50),
    // Per-edit instructions: what the author asked the editor to change, in
    // their own words, chapter by chapter.
    db
      .select({
        id: schema.suggestions.id,
        chapterNumber: schema.chapters.chapterNumber,
        passType: schema.suggestions.passType,
        status: schema.suggestions.status,
        instruction: schema.suggestions.instruction,
        createdAt: schema.suggestions.createdAt,
      })
      .from(schema.suggestions)
      .innerJoin(schema.chapters, eq(schema.chapters.id, schema.suggestions.chapterId))
      .where(and(eq(schema.chapters.bookId, row.bookId), isNotNull(schema.suggestions.instruction)))
      .orderBy(desc(schema.suggestions.createdAt))
      .limit(100),
    // Content-tool invocations, whose input jsonb already held the selected
    // text and the author's options.
    db
      .select({
        id: schema.contentToolRuns.id,
        toolId: schema.contentToolRuns.toolId,
        input: schema.contentToolRuns.input,
        createdAt: schema.contentToolRuns.createdAt,
      })
      .from(schema.contentToolRuns)
      .where(eq(schema.contentToolRuns.projectId, projectId))
      .orderBy(desc(schema.contentToolRuns.createdAt))
      .limit(50),
  ]);

  return { ...row, chapters, flags, outlines, runs, instructions, toolRuns };
}

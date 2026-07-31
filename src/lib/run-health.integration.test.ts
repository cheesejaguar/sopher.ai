import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb, schema } from "@/db";
import { getRunHealth } from "@/lib/run-health";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  const requested = isolated === "1" || Boolean(value);
  if (!requested) return null;

  if (isolated !== "1") {
    throw new Error("Refusing run-health integration tests without E2E_DATABASE_ISOLATED=1.");
  }
  if (!value) {
    throw new Error("E2E_DATABASE_URL must identify the disposable database branch.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing run-health integration tests in NODE_ENV=production.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("E2E_DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("E2E_DATABASE_URL must be a PostgreSQL connection URL with a hostname.");
  }
  const allowedHost = process.env.E2E_DATABASE_HOST?.trim();
  if (!allowedHost || parsed.hostname !== allowedHost) {
    throw new Error(
      "E2E_DATABASE_HOST must exactly match the disposable database branch hostname.",
    );
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

describeIsolated("run health against isolated Neon", () => {
  const suffix = randomUUID();
  const userId = `e2e-run-health-${suffix}`;
  const projectId = randomUUID();
  const runId = randomUUID();
  const eventAt = new Date("2026-07-30T19:29:00.000Z");
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let observer: ReturnType<typeof neon> | null = null;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Isolated database URL disappeared before test setup.");
    process.env.DATABASE_URL = databaseUrl;
    observer = neon(databaseUrl);

    await observer`
      insert into users (id, email)
      values (${userId}, ${`${userId}@example.test`})
    `;
    await observer`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, 'Run health fixture',
        'A disposable fixture for timestamp decoding.', 'fantasy',
        'full_book', 3, 1000, '{}'::jsonb
      )
    `;
    await observer`
      insert into generation_runs (
        id, project_id, user_id, kind, status, config, started_at, created_at
      )
      values (
        ${runId}, ${projectId}, ${userId}, 'full_book', 'running',
        '{"tier":"standard","targetChapters":3,"targetWordsPerChapter":1000}'::jsonb,
        ${new Date("2026-07-30T19:28:30.000Z")},
        ${new Date("2026-07-30T19:28:00.000Z")}
      )
    `;
    await observer`
      insert into generation_events (run_id, seq, type, payload, created_at)
      values (
        ${runId}, 1, 'stage',
        '{"type":"stage","stage":"concept","pct":5,"detail":"Shaping the concept"}'::jsonb,
        ${eventAt}
      )
    `;
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id = ${userId}`;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("decodes a raw max(timestamp) value before computing run health", async () => {
    const db = getDb();
    const [aggregate] = await db
      .select({
        lastAt: sql<Date | string | null>`max(${schema.generationEvents.createdAt})`,
      })
      .from(schema.generationEvents)
      .where(eq(schema.generationEvents.runId, runId));

    expect(typeof aggregate?.lastAt).toBe("string");

    const [run] = await db
      .select()
      .from(schema.generationRuns)
      .where(eq(schema.generationRuns.id, runId))
      .limit(1);
    expect(run).toBeDefined();

    const health = await getRunHealth(run!);
    expect(health).toMatchObject({
      databaseStatus: "running",
      workflowStatus: "missing",
      effectiveStatus: "running",
      lastEventAt: eventAt.toISOString(),
      lastUpdateAt: eventAt.toISOString(),
      stage: "concept",
      progressPct: 5,
      authoringBegan: true,
    });
  });

  it("reports net credits after delivery refunds without subtracting unrelated adjustments", async () => {
    if (!observer) throw new Error("Isolated database observer is unavailable");

    await observer`
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      values
        (
          ${userId}, -0.4742, 'usage', 'Refunded provider usage',
          ${projectId}, ${runId}, ${`llm:generation:${runId}:refine:attempt:one:step:0`}
        ),
        (
          ${userId}, -0.2415, 'usage', 'Delivered provider usage',
          ${projectId}, ${runId}, ${`llm:generation:${runId}:expand:attempt:two:step:0`}
        ),
        (
          ${userId}, 0.4742, 'adjustment', 'Undelivered output compensation',
          ${projectId}, ${runId}, ${`delivery-refund:llm:generation:${runId}:refine:attempt:one`}
        ),
        (
          ${userId}, 9.0000, 'adjustment', 'Malformed unmatched compensation',
          ${projectId}, ${runId}, ${`delivery-refund:llm:generation:${runId}:unmatched`}
        ),
        (
          ${userId}, 1.0000, 'adjustment', 'Unrelated account adjustment',
          ${projectId}, ${runId}, ${`support-adjustment:${runId}`}
        )
    `;

    const [run] = await getDb()
      .select()
      .from(schema.generationRuns)
      .where(eq(schema.generationRuns.id, runId))
      .limit(1);
    expect(run).toBeDefined();

    const health = await getRunHealth(run!);
    expect(health.spend.creditsUsed).toBeCloseTo(0.2415, 4);
  });
});

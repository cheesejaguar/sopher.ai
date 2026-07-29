import { getCache } from "@vercel/functions";
import { and, eq, gte, sum } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { calculateUsd, type UsageTokens } from "./pricing";

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

/** Persists one llm_calls row and busts the cached month-to-date spend. Returns the metered USD. */
export async function recordLlmCall(record: LlmCallRecord): Promise<number> {
  const usd = calculateUsd(record.model, record.usage);
  const db = getDb();
  await db.insert(schema.llmCalls).values({
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
  });
  await getCache().delete(spendCacheKey(record.userId));
  return usd;
}

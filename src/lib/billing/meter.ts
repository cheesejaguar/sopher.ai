import { getCache } from "@vercel/functions";
import { and, eq, gte, sum } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { calculateUsd, type UsageTokens } from "./pricing";

export class BudgetExceededError extends Error {
  constructor(
    public readonly spentUsd: number,
    public readonly limitUsd: number,
  ) {
    super(`Monthly budget exceeded: $${spentUsd.toFixed(2)} of $${limitUsd.toFixed(2)}`);
    this.name = "BudgetExceededError";
  }
}

export const DEFAULT_MONTHLY_LIMIT_USD = 20;

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const SPEND_CACHE_TTL_SECONDS = 60;

function spendCacheKey(userId: string) {
  return `budget-spend:${userId}`;
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
    tags: [`budget:${userId}`],
    name: "budget-spend",
  });
  return spent;
}

export async function getBudget(userId: string) {
  const db = getDb();
  const [budget] = await db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.userId, userId))
    .limit(1);
  return {
    monthlyLimitUsd: budget ? Number(budget.monthlyLimitUsd) : DEFAULT_MONTHLY_LIMIT_USD,
    hardLimit: budget?.hardLimit ?? true,
    alertThresholdPct: budget?.alertThresholdPct ?? 80,
  };
}

/**
 * Throws BudgetExceededError when a hard-limited user is at/over budget.
 * `upcomingEstimateUsd` lets callers pre-flight an operation's estimated cost.
 */
export async function checkBudget(userId: string, upcomingEstimateUsd = 0): Promise<void> {
  const [spent, budget] = await Promise.all([getMonthToDateSpend(userId), getBudget(userId)]);
  if (budget.hardLimit && spent + upcomingEstimateUsd > budget.monthlyLimitUsd) {
    throw new BudgetExceededError(spent, budget.monthlyLimitUsd);
  }
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

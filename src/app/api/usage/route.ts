import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getMonthToDateSpend } from "@/lib/billing/meter";
import { CREDIT_MARKUP, getBalance } from "@/lib/billing/credits";

export async function GET() {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }

  const db = getDb();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [spent, balance, byProject, byModel] = await Promise.all([
    getMonthToDateSpend(userId),
    getBalance(userId),
    db
      .select({
        projectId: schema.llmCalls.projectId,
        title: schema.projects.title,
        usd: sql<string>`sum(${schema.llmCalls.usd})`,
        calls: sql<number>`count(*)::int`,
      })
      .from(schema.llmCalls)
      .leftJoin(schema.projects, eq(schema.llmCalls.projectId, schema.projects.id))
      .where(and(eq(schema.llmCalls.userId, userId), gte(schema.llmCalls.createdAt, monthStart)))
      .groupBy(schema.llmCalls.projectId, schema.projects.title)
      .orderBy(desc(sql`sum(${schema.llmCalls.usd})`)),
    db
      .select({
        model: schema.llmCalls.model,
        agentRole: schema.llmCalls.agentRole,
        inputTokens: sql<string>`sum(${schema.llmCalls.inputTokens})`,
        outputTokens: sql<string>`sum(${schema.llmCalls.outputTokens})`,
        usd: sql<string>`sum(${schema.llmCalls.usd})`,
      })
      .from(schema.llmCalls)
      .where(and(eq(schema.llmCalls.userId, userId), gte(schema.llmCalls.createdAt, monthStart)))
      .groupBy(schema.llmCalls.model, schema.llmCalls.agentRole),
  ]);

  return Response.json({
    monthToDateUsd: spent,
    monthToDateCredits: spent * CREDIT_MARKUP,
    balance,
    byProject: byProject.map((r) => ({ ...r, usd: Number(r.usd) })),
    byModel: byModel.map((r) => ({
      ...r,
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      usd: Number(r.usd),
    })),
  });
}

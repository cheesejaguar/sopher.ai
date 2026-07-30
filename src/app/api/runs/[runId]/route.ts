import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getRunHealth } from "@/lib/run-health";

export const maxDuration = 30;

/** Workflow-aware run snapshot, polled alongside the resumable prose stream. */
export async function GET(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }
  const { runId } = await ctx.params;
  if (!z.uuid().safeParse(runId).success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const db = getDb();
  const [run] = await db
    .select({
      id: schema.generationRuns.id,
      projectId: schema.generationRuns.projectId,
      userId: schema.generationRuns.userId,
      workflowRunId: schema.generationRuns.workflowRunId,
      kind: schema.generationRuns.kind,
      status: schema.generationRuns.status,
      config: schema.generationRuns.config,
      error: schema.generationRuns.error,
      startedAt: schema.generationRuns.startedAt,
      completedAt: schema.generationRuns.completedAt,
      acceptanceUncertainAt: schema.generationRuns.acceptanceUncertainAt,
      acceptanceDispatchClaimedAt: schema.generationRuns.acceptanceDispatchClaimedAt,
      healthCheckedAt: schema.generationRuns.healthCheckedAt,
      createdAt: schema.generationRuns.createdAt,
    })
    .from(schema.generationRuns)
    .where(and(eq(schema.generationRuns.id, runId), eq(schema.generationRuns.userId, userId)))
    .limit(1);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  const health = await getRunHealth(run);

  // The durable config can contain checkpointed prose and grows throughout a
  // run. Keep it server-side: this endpoint is polled every five seconds and
  // the client needs only status metadata plus the compact health summary.
  return Response.json(
    {
      run: {
        id: run.id,
        status: run.status,
        error: run.error,
        kind: run.kind,
        workflowRunId: run.workflowRunId,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      },
      health,
      totalUsd: health.spend.meteredUsd,
      totalCredits: health.spend.creditsUsed,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

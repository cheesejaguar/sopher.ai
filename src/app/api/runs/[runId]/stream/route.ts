import { getRun } from "workflow/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { PROGRESS_NS } from "@/lib/run-events";

export const maxDuration = 300;

/**
 * Streams a run's namespaced events as NDJSON. Resumable: pass ?startIndex=N
 * to replay from a known position after a disconnect or reload.
 */
export async function GET(req: Request, ctx: { params: Promise<{ runId: string }> }) {
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
  const url = new URL(req.url);
  const namespace = url.searchParams.get("ns") ?? PROGRESS_NS;
  const startIndex = Number(url.searchParams.get("startIndex") ?? "0");

  const db = getDb();
  const [run] = await db
    .select({
      workflowRunId: schema.generationRuns.workflowRunId,
      userId: schema.generationRuns.userId,
    })
    .from(schema.generationRuns)
    .where(and(eq(schema.generationRuns.id, runId), eq(schema.generationRuns.userId, userId)))
    .limit(1);
  if (!run?.workflowRunId) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const readable = getRun(run.workflowRunId).getReadable({
    namespace,
    startIndex: Number.isFinite(startIndex) ? startIndex : 0,
  });

  const encoder = new TextEncoder();
  const ndjson = readable.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
      },
    }),
  );

  return new Response(ndjson, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

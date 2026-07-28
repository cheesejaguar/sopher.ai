import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

/** Page-load snapshot of a run (never polled — the stream endpoint is the live channel). */
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
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.generationRuns)
    .where(and(eq(schema.generationRuns.id, runId), eq(schema.generationRuns.userId, userId)))
    .limit(1);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

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

  return Response.json({ run, events });
}

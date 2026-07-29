import { resumeHook } from "workflow/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getBalance } from "@/lib/billing/credits";

const bodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("outline-approval"),
    approved: z.boolean(),
    notes: z.string().max(5_000).optional(),
  }),
  // Resumes a run suspended mid-book because the wallet ran short. The balance
  // is re-checked here so a resume cannot be forced without actually paying.
  z.object({ kind: z.literal("credits-topup") }),
]);

/** Resumes a paused run (human-in-the-loop input, e.g. outline approval). */
export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
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
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const [run] = await db
    .select({ id: schema.generationRuns.id, status: schema.generationRuns.status })
    .from(schema.generationRuns)
    .where(and(eq(schema.generationRuns.id, runId), eq(schema.generationRuns.userId, userId)))
    .limit(1);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (run.status !== "awaiting_input") {
    return Response.json({ error: "Run is not waiting for input" }, { status: 409 });
  }

  if (parsed.data.kind === "credits-topup") {
    const balance = await getBalance(userId);
    if (balance <= 0) {
      return Response.json({ error: "Add credits before resuming", balance }, { status: 402 });
    }
    await resumeHook(`credits-topup:${runId}`, { toppedUp: true });
    return Response.json({ resumed: true, balance });
  }

  await resumeHook(`outline-approval:${runId}`, {
    approved: parsed.data.approved,
    notes: parsed.data.notes,
  });
  return Response.json({ resumed: true });
}

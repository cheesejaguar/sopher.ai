import { start, getRun } from "workflow/api";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getOrCreateBook } from "@/db/queries/projects";
import { generateBook } from "@/workflows/generate-book";
import type { GenerationConfig } from "@/lib/run-events";

export const maxDuration = 60;

const bodySchema = z.object({
  tier: z.enum(["draft", "standard", "premium"]).default("standard"),
  requireOutlineApproval: z.boolean().default(false),
});

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }
  const { projectId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDb();
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const [activeRun] = await db
    .select({ id: schema.generationRuns.id })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
      ),
    )
    .limit(1);
  if (activeRun) {
    return Response.json(
      { error: "A generation run is already in progress", runId: activeRun.id },
      { status: 409 },
    );
  }

  await getOrCreateBook(project.id, project.title);

  const config: GenerationConfig = {
    tier: parsed.data.tier,
    requireOutlineApproval: parsed.data.requireOutlineApproval,
    waveSize: 4,
  };

  const [run] = await db
    .insert(schema.generationRuns)
    .values({
      projectId,
      userId,
      kind: "full_book",
      status: "queued",
      config,
    })
    .returning({ id: schema.generationRuns.id });

  const workflowRun = await start(generateBook, [run.id, projectId, userId, config]);
  await db
    .update(schema.generationRuns)
    .set({ workflowRunId: workflowRun.runId })
    .where(eq(schema.generationRuns.id, run.id));

  return Response.json({ runId: run.id }, { status: 202 });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }
  const { projectId } = await ctx.params;
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.userId, userId),
        inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
      ),
    )
    .limit(1);
  if (!run) return Response.json({ error: "No active run" }, { status: 404 });

  if (run.workflowRunId) {
    await getRun(run.workflowRunId).cancel();
  }
  await db
    .update(schema.generationRuns)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(schema.generationRuns.id, run.id));
  await db
    .update(schema.projects)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(schema.projects.id, projectId));

  return Response.json({ cancelled: true });
}

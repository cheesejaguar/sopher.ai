import { start } from "workflow/api";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { EXPORT_FORMATS, FORMAT_META, type ExportFormat } from "@/lib/export/types";
import { exportBook } from "@/workflows/export";

export const maxDuration = 60;

const bodySchema = z.object({
  format: z.enum(EXPORT_FORMATS),
});

/** Kick off an export run for the project's current manuscript. 202 {runId}. */
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
  const format: ExportFormat = parsed.data.format;

  const db = getDb();
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const [activeExport] = await db
    .select({ id: schema.generationRuns.id })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.kind, "export"),
        inArray(schema.generationRuns.status, ["queued", "running"]),
      ),
    )
    .limit(1);
  if (activeExport) {
    return Response.json(
      { error: "An export is already in progress", runId: activeExport.id },
      { status: 409 },
    );
  }

  const [run] = await db
    .insert(schema.generationRuns)
    .values({
      projectId,
      userId,
      kind: "export",
      status: "queued",
      config: { format },
    })
    .returning({ id: schema.generationRuns.id });

  const workflowRun = await start(exportBook, [run.id, projectId, userId, format]);
  await db
    .update(schema.generationRuns)
    .set({ workflowRunId: workflowRun.runId })
    .where(eq(schema.generationRuns.id, run.id));

  return Response.json({ runId: run.id }, { status: 202 });
}

const querySchema = z.object({ runId: z.uuid() });

/** Poll an export run: {status, error?, asset?: {id, url, filename}}. */
export async function GET(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
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
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ runId: url.searchParams.get("runId") });
  if (!parsed.success) {
    return Response.json({ error: "runId query param must be a run id" }, { status: 400 });
  }

  const db = getDb();
  const [run] = await db
    .select({
      id: schema.generationRuns.id,
      status: schema.generationRuns.status,
      error: schema.generationRuns.error,
      config: schema.generationRuns.config,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.id, parsed.data.runId),
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.userId, userId),
        eq(schema.generationRuns.kind, "export"),
      ),
    )
    .limit(1);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  let asset: { id: string; url: string; filename: string } | null = null;
  if (run.status === "completed") {
    const format = (run.config as { format?: ExportFormat }).format;
    const [row] = await db
      .select({ id: schema.assets.id, meta: schema.assets.meta, pathname: schema.assets.blobPathname })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.projectId, projectId),
          sql`${schema.assets.meta}->>'runId' = ${run.id}`,
          ...(format ? [eq(schema.assets.kind, FORMAT_META[format].assetKind)] : []),
        ),
      )
      .orderBy(desc(schema.assets.createdAt))
      .limit(1);
    if (row) {
      const meta = row.meta as { filename?: string };
      asset = {
        id: row.id,
        // The blob URL stays server-side; the UI downloads through our route.
        url: `/api/exports/${row.id}`,
        filename: meta.filename ?? row.pathname.split("/").at(-1) ?? "manuscript",
      };
    }
  }

  return Response.json({ status: run.status, error: run.error, asset });
}

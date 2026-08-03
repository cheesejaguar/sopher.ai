import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, withDbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { captureExportSnapshot } from "@/lib/export/assemble";
import { dispatchExportWorkflow, reconcileExportDispatch } from "@/lib/export-dispatch";
import { EXPORT_FORMATS, FORMAT_META, type ExportFormat } from "@/lib/export/types";

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
  if (!z.uuid().safeParse(projectId).success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const format: ExportFormat = parsed.data.format;

  const prepared = await withDbTransaction(async (tx) => {
    // Every query below sees the same manuscript edition, even when a chapter
    // commit lands while this request is preparing the export.
    await tx.execute(sql`set transaction isolation level repeatable read`);
    await lockProjectAuthoring(tx, projectId);

    const [activeExport] = await tx
      .select({ id: schema.generationRuns.id })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.projectId, projectId),
          eq(schema.generationRuns.userId, userId),
          eq(schema.generationRuns.kind, "export"),
          inArray(schema.generationRuns.status, ["queued", "running"]),
        ),
      )
      .limit(1);
    if (activeExport) return { kind: "active" as const, runId: activeExport.id };

    const snapshot = await captureExportSnapshot(tx, userId, projectId);
    if (!snapshot) return { kind: "missing" as const };
    if (snapshot.manuscript.chapters.length === 0) return { kind: "empty" as const };

    const [run] = await tx
      .insert(schema.generationRuns)
      .values({
        projectId,
        userId,
        kind: "export",
        status: "queued",
        config: { format, snapshot },
        dispatchAttempts: 1,
        acceptanceDispatchClaimedAt: new Date(),
      })
      .returning({ id: schema.generationRuns.id });
    return { kind: "ready" as const, run, snapshot };
  });

  if (prepared.kind === "missing") {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  if (prepared.kind === "empty") {
    return Response.json({ error: "No chapters have been written yet" }, { status: 409 });
  }
  if (prepared.kind === "active") {
    return Response.json(
      { error: "An export is already in progress", runId: prepared.runId },
      { status: 409 },
    );
  }

  const { run, snapshot } = prepared;
  const dispatch = await dispatchExportWorkflow({
    runId: run.id,
    projectId,
    userId,
    format,
  });

  return Response.json(
    {
      runId: run.id,
      incomplete: snapshot.incomplete,
      capturedAt: snapshot.capturedAt,
      acceptanceUncertain: dispatch.outcome === "acceptance_uncertain",
    },
    { status: 202 },
  );
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
  if (!z.uuid().safeParse(projectId).success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ runId: url.searchParams.get("runId") });
  if (!parsed.success) {
    return Response.json({ error: "runId query param must be a run id" }, { status: 400 });
  }

  const db = getDb();
  let [run] = await db
    .select()
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

  if (run.status === "queued" && !run.workflowRunId) {
    const reconciliation = await reconcileExportDispatch(run);
    if (reconciliation !== "unchanged") {
      [run] = await db
        .select()
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
    }
  }

  let asset: {
    id: string;
    url: string;
    filename: string;
    incomplete?: boolean;
    capturedAt?: string;
  } | null = null;
  if (run.status === "completed") {
    const format = (run.config as { format?: ExportFormat }).format;
    const [row] = await db
      .select({
        id: schema.assets.id,
        meta: schema.assets.meta,
        pathname: schema.assets.blobPathname,
      })
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
      const meta = row.meta as {
        filename?: string;
        incomplete?: boolean;
        capturedAt?: string;
      };
      asset = {
        id: row.id,
        // The blob URL stays server-side; the UI downloads through our route.
        url: `/api/exports/${row.id}`,
        filename: meta.filename ?? row.pathname.split("/").at(-1) ?? "manuscript",
        ...(typeof meta.incomplete === "boolean" ? { incomplete: meta.incomplete } : {}),
        ...(meta.capturedAt ? { capturedAt: meta.capturedAt } : {}),
      };
    }
  }

  return Response.json({
    status: run.status,
    error: run.error,
    asset,
    acceptanceUncertain:
      run.status === "queued" &&
      !run.workflowRunId &&
      Boolean(run.acceptanceUncertainAt ?? run.acceptanceDispatchClaimedAt),
    dispatchAttempts: run.dispatchAttempts,
  });
}

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, withDbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { captureExportSnapshot } from "@/lib/export/assemble";
import {
  dispatchExportWorkflow,
  reconcileActiveExportRuns,
  reconcileExportDispatch,
} from "@/lib/export-dispatch";
import {
  DEFAULT_PRINT_OPTIONS,
  EXPORT_FORMATS,
  FORMAT_META,
  type ExportFormat,
} from "@/lib/export/types";
import { printOptionsSchema } from "@/lib/export/print-layout";
import {
  exportFormat,
  type ExportHistoryAsset,
  type ExportHistoryItem,
} from "@/lib/export/history";

export const maxDuration = 60;

const bodySchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  // Print layout rides along as data in the run's config, next to the snapshot,
  // so the Workflow keeps its signature and its redispatch path. Every field
  // defaults, so a client that sends nothing gets the geometry it always got.
  print: printOptionsSchema.default(DEFAULT_PRINT_OPTIONS),
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

  // A Workflow can finish after persisting the file but before persisting its
  // terminal run status. Repair that evidence-backed crash window before an
  // old export is allowed to block a new one.
  await reconcileActiveExportRuns({ projectId, userId, limit: 8 }).catch((error) => {
    console.error("Could not reconcile export before start", { projectId, error });
  });

  const prepared = await withDbTransaction(async (tx) => {
    // Every query below sees the same manuscript edition, even when a chapter
    // commit lands while this request is preparing the export.
    await tx.execute(sql`set transaction isolation level repeatable read`);
    await lockProjectAuthoring(tx, projectId);

    const [activeExport] = await tx
      .select({ id: schema.generationRuns.id, config: schema.generationRuns.config })
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
    if (activeExport) {
      const config = activeExport.config as {
        format?: unknown;
        snapshot?: { incomplete?: boolean; capturedAt?: string };
      };
      return {
        kind: "active" as const,
        runId: activeExport.id,
        format: exportFormat(config.format),
        incomplete: config.snapshot?.incomplete,
        capturedAt: config.snapshot?.capturedAt,
      };
    }

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
        config: { format, snapshot, print: parsed.data.print },
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
      {
        error: "An export is already in progress",
        runId: prepared.runId,
        format: prepared.format,
        incomplete: prepared.incomplete,
        capturedAt: prepared.capturedAt,
      },
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

const querySchema = z.object({ runId: z.uuid().optional() });

const EXPORT_ASSET_KINDS = EXPORT_FORMATS.map((format) => FORMAT_META[format].assetKind);

type ExportRunRow = typeof schema.generationRuns.$inferSelect;

function snapshotMeta(run: Pick<ExportRunRow, "config">): {
  format: ExportFormat | null;
  incomplete?: boolean;
  capturedAt?: string;
} {
  const config = run.config as {
    format?: unknown;
    snapshot?: { incomplete?: boolean; capturedAt?: string };
  };
  return {
    format: exportFormat(config.format),
    ...(typeof config.snapshot?.incomplete === "boolean"
      ? { incomplete: config.snapshot.incomplete }
      : {}),
    ...(typeof config.snapshot?.capturedAt === "string"
      ? { capturedAt: config.snapshot.capturedAt }
      : {}),
  };
}

function assetFromRow(row: { id: string; meta: unknown; pathname: string }): ExportHistoryAsset {
  const meta = row.meta as {
    filename?: string;
    incomplete?: boolean;
    capturedAt?: string;
  };
  return {
    id: row.id,
    filename: meta.filename ?? row.pathname.split("/").at(-1) ?? "manuscript",
    ...(typeof meta.incomplete === "boolean" ? { incomplete: meta.incomplete } : {}),
    ...(typeof meta.capturedAt === "string" ? { capturedAt: meta.capturedAt } : {}),
  };
}

async function listExportHistory(
  userId: string,
  projectId: string,
): Promise<ExportHistoryItem[] | null> {
  const db = getDb();
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return null;

  await reconcileActiveExportRuns({ projectId, userId, limit: 8 }).catch((error) => {
    console.error("Could not reconcile export history", { projectId, error });
  });

  let runs = await db
    .select()
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.userId, userId),
        eq(schema.generationRuns.kind, "export"),
      ),
    )
    .orderBy(desc(schema.generationRuns.createdAt))
    .limit(8);

  const queuedWithoutWorkflow = runs.find((run) => run.status === "queued" && !run.workflowRunId);
  if (queuedWithoutWorkflow) {
    const reconciliation = await reconcileExportDispatch(queuedWithoutWorkflow);
    if (reconciliation !== "unchanged") {
      runs = await db
        .select()
        .from(schema.generationRuns)
        .where(
          and(
            eq(schema.generationRuns.projectId, projectId),
            eq(schema.generationRuns.userId, userId),
            eq(schema.generationRuns.kind, "export"),
          ),
        )
        .orderBy(desc(schema.generationRuns.createdAt))
        .limit(8);
    }
  }

  const runIds = runs.map((run) => run.id);
  const assetRows =
    runIds.length === 0
      ? []
      : await db
          .select({
            id: schema.assets.id,
            meta: schema.assets.meta,
            pathname: schema.assets.blobPathname,
            createdAt: schema.assets.createdAt,
          })
          .from(schema.assets)
          .where(
            and(
              eq(schema.assets.projectId, projectId),
              inArray(schema.assets.kind, EXPORT_ASSET_KINDS),
              inArray(sql<string>`${schema.assets.meta}->>'runId'`, runIds),
            ),
          )
          .orderBy(desc(schema.assets.createdAt));
  const assetsByRun = new Map<string, ExportHistoryAsset>();
  for (const row of assetRows) {
    const runId = (row.meta as { runId?: unknown }).runId;
    if (typeof runId === "string" && !assetsByRun.has(runId)) {
      assetsByRun.set(runId, assetFromRow(row));
    }
  }

  return runs.map((run) => {
    const snapshot = snapshotMeta(run);
    const asset = assetsByRun.get(run.id) ?? null;
    return {
      runId: run.id,
      format: snapshot.format,
      status: run.status,
      error: run.error,
      asset,
      incomplete: asset?.incomplete ?? snapshot.incomplete,
      capturedAt: asset?.capturedAt ?? snapshot.capturedAt,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      acceptanceUncertain:
        run.status === "queued" &&
        !run.workflowRunId &&
        Boolean(run.acceptanceUncertainAt ?? run.acceptanceDispatchClaimedAt),
      dispatchAttempts: run.dispatchAttempts,
    };
  });
}

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
  const parsed = querySchema.safeParse({ runId: url.searchParams.get("runId") ?? undefined });
  if (!parsed.success) {
    return Response.json({ error: "runId query param must be a run id" }, { status: 400 });
  }

  if (!parsed.data.runId) {
    const exports = await listExportHistory(userId, projectId);
    if (!exports) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json({ exports });
  }

  const db = getDb();
  await reconcileActiveExportRuns({ projectId, userId, limit: 8 }).catch((error) => {
    console.error("Could not reconcile export status", { projectId, error });
  });
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

  let asset: ExportHistoryAsset | null = null;
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
      asset = assetFromRow(row);
    }
  }

  const snapshot = snapshotMeta(run);

  return Response.json({
    runId: run.id,
    format: snapshot.format,
    status: run.status,
    error: run.error,
    asset,
    incomplete: asset?.incomplete ?? snapshot.incomplete,
    capturedAt: asset?.capturedAt ?? snapshot.capturedAt,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    acceptanceUncertain:
      run.status === "queued" &&
      !run.workflowRunId &&
      Boolean(run.acceptanceUncertainAt ?? run.acceptanceDispatchClaimedAt),
    dispatchAttempts: run.dispatchAttempts,
  });
}

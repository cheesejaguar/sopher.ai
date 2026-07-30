import { FatalError, getWritable } from "workflow";
import { put } from "@vercel/blob";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { compensateBlobPersistenceFailure } from "@/lib/blob/lifecycle";
import {
  compensateUnreferencedBlobUpload,
  scheduleUnreferencedBlobCleanup,
} from "@/lib/blob/orphan-cleanup";
import { loadManuscript } from "@/lib/export/assemble";
import { renderExport } from "@/lib/export";
import { FORMAT_META, type ExportFormat } from "@/lib/export/types";
import { PROGRESS_NS, type RunEvent } from "@/lib/run-events";

/**
 * Export runs are quick (<30s), so the UI polls GET /api/projects/[id]/export
 * for status rather than opening a stream. We still emit two coarse RunEvents
 * on the progress namespace and persist them to generation_events, so the
 * standard run snapshot endpoint shows the export's history.
 */

type RunRef = {
  dbRunId: string;
  projectId: string;
  userId: string;
};

async function writeProgress(ref: RunRef, event: RunEvent) {
  const writer = getWritable<RunEvent>({ namespace: PROGRESS_NS }).getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
  const db = getDb();
  await db.insert(schema.generationEvents).values({
    runId: ref.dbRunId,
    seq: sql`coalesce((select max(seq) from ${schema.generationEvents} where ${schema.generationEvents.runId} = ${ref.dbRunId}), 0) + 1` as unknown as number,
    type: event.type,
    payload: event,
  });
}

export async function markExportStatus(
  ref: RunRef,
  status: "running" | "completed" | "failed",
  error?: string,
): Promise<boolean> {
  "use step";
  const db = getDb();
  const updated = await db
    .update(schema.generationRuns)
    .set({
      status,
      error: error ?? null,
      ...(status === "running" ? { startedAt: new Date() } : { completedAt: new Date() }),
    })
    .where(
      and(
        eq(schema.generationRuns.id, ref.dbRunId),
        eq(schema.generationRuns.userId, ref.userId),
        eq(schema.generationRuns.projectId, ref.projectId),
        status === "running"
          ? eq(schema.generationRuns.status, "queued")
          : inArray(schema.generationRuns.status, ["queued", "running"]),
      ),
    )
    .returning({ id: schema.generationRuns.id });
  if (updated.length > 0) return true;

  // The database mutation and Workflow step checkpoint are not one atomic
  // commit. Treat a replay of the same transition as success, but never
  // resurrect or overwrite a different terminal state.
  const [existing] = await db
    .select({ status: schema.generationRuns.status })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.id, ref.dbRunId),
        eq(schema.generationRuns.userId, ref.userId),
        eq(schema.generationRuns.projectId, ref.projectId),
      ),
    )
    .limit(1);
  return existing?.status === status;
}

async function emitExportProgress(ref: RunRef, event: RunEvent) {
  "use step";
  await writeProgress(ref, event);
}

/**
 * Minted in its own step so retries of the upload step reuse the same token
 * (and thus the same blob pathname) instead of re-rolling it.
 */
async function mintExportToken(): Promise<string> {
  "use step";
  return crypto.randomUUID();
}

/**
 * Assemble + render + upload in a single step: the rendered buffer must never
 * cross a step boundary as an argument, so the whole byte-producing path lives
 * here and only small identifiers leave.
 */
async function assembleAndUploadStep(
  ref: RunRef,
  format: ExportFormat,
  token: string,
): Promise<{ assetId: string; filename: string }> {
  "use step";
  const manuscript = await loadManuscript(ref.userId, ref.projectId);
  if (!manuscript) throw new FatalError("Project has no book to export");
  if (manuscript.chapters.length === 0) {
    throw new FatalError("No chapters have been written yet — nothing to export");
  }

  const result = await renderExport(format, manuscript);
  const meta = FORMAT_META[format];
  const db = getDb();
  const findExistingAsset = async () => {
    const [existing] = await db
      .select({ id: schema.assets.id, meta: schema.assets.meta })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.projectId, ref.projectId),
          eq(schema.assets.kind, meta.assetKind),
          sql`${schema.assets.meta}->>'runId' = ${ref.dbRunId}`,
        ),
      )
      .limit(1);
    return existing;
  };

  // A workflow retry after a committed insert must return the original asset
  // instead of creating a duplicate row for the same export run.
  const existing = await findExistingAsset();
  if (existing) {
    const existingMeta = existing.meta as { filename?: string };
    return { assetId: existing.id, filename: existingMeta.filename ?? result.filename };
  }

  const blob = await put(
    `exports/${ref.projectId}/${token}.${meta.extension}`,
    Buffer.from(result.buffer),
    {
      access: "public",
      contentType: result.contentType,
      allowOverwrite: true, // step retries re-upload to the same pathname
    },
  );

  // The workflow step retries, but an exhausted run would otherwise leave an
  // upload with no asset row. Schedule reference-aware cleanup before the
  // transaction, exactly like request-time asset producers.
  try {
    await scheduleUnreferencedBlobCleanup({
      projectId: ref.projectId,
      pathnames: [blob.pathname],
    });
  } catch (scheduleError) {
    try {
      await compensateUnreferencedBlobUpload({
        projectId: ref.projectId,
        pathnames: [blob.pathname],
      });
    } catch (cleanupError) {
      throw new AggregateError(
        [
          scheduleError instanceof Error ? scheduleError : new Error(String(scheduleError)),
          cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)),
        ],
        "Export cleanup could not be made durable",
      );
    }
    throw scheduleError;
  }

  let asset: { id: string; meta: unknown } | undefined;
  try {
    asset = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(
          hashtextextended('sopher:project-authoring:' || ${ref.projectId}, 0)
        )`,
      );
      const [alreadyStored] = await tx
        .select({ id: schema.assets.id, meta: schema.assets.meta })
        .from(schema.assets)
        .where(
          and(
            eq(schema.assets.projectId, ref.projectId),
            eq(schema.assets.kind, meta.assetKind),
            sql`${schema.assets.meta}->>'runId' = ${ref.dbRunId}`,
          ),
        )
        .limit(1);
      if (alreadyStored) return alreadyStored;
      const [stored] = await tx
        .insert(schema.assets)
        .values({
          projectId: ref.projectId,
          kind: meta.assetKind,
          blobUrl: blob.url,
          blobPathname: blob.pathname,
          contentType: result.contentType,
          sizeBytes: result.buffer.byteLength,
          meta: { runId: ref.dbRunId, format, filename: result.filename },
        })
        .returning({ id: schema.assets.id, meta: schema.assets.meta });
      return stored;
    });
    if (!asset) throw new Error("Could not record the export asset");
  } catch (error) {
    // A rejected database response can be ambiguous. Verify the row before
    // deleting the deterministic Blob pathname so a committed asset is never
    // broken by compensation.
    let committed;
    try {
      committed = await findExistingAsset();
    } catch (verificationError) {
      console.error("Could not verify export persistence after an insert failure", {
        runId: ref.dbRunId,
        pathname: blob.pathname,
        verificationError,
      });
      throw new AggregateError(
        [
          error instanceof Error ? error : new Error(String(error)),
          verificationError instanceof Error
            ? verificationError
            : new Error(String(verificationError)),
        ],
        "Export persistence failed and could not be verified",
      );
    }
    if (committed) {
      const committedMeta = committed.meta as { filename?: string };
      return { assetId: committed.id, filename: committedMeta.filename ?? result.filename };
    }
    await compensateBlobPersistenceFailure(error, [blob.pathname], "export");
  }

  if (!asset) throw new Error("Could not record the export asset");
  const assetMeta = asset.meta as { filename?: string };
  return { assetId: asset.id, filename: assetMeta.filename ?? result.filename };
}

export async function exportBook(
  dbRunId: string,
  projectId: string,
  userId: string,
  format: ExportFormat,
) {
  "use workflow";
  const ref: RunRef = { dbRunId, projectId, userId };

  try {
    if (!(await markExportStatus(ref, "running"))) {
      throw new FatalError("Export is no longer active");
    }
    await emitExportProgress(ref, {
      type: "stage",
      stage: "finalizing",
      pct: 10,
      detail: `Assembling the ${FORMAT_META[format].label} edition`,
    });

    const token = await mintExportToken();
    const { assetId, filename } = await assembleAndUploadStep(ref, format, token);

    if (!(await markExportStatus(ref, "completed"))) {
      throw new FatalError("Export was cancelled before completion");
    }
    await emitExportProgress(ref, { type: "stage", stage: "done", pct: 100, detail: filename });
    return { assetId, filename };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    await markExportStatus(ref, "failed", message);
    await emitExportProgress(ref, { type: "error", message, fatal: true });
    throw error instanceof FatalError ? error : new FatalError(message);
  }
}

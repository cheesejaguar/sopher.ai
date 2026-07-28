import { FatalError, getWritable } from "workflow";
import { put } from "@vercel/blob";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
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

async function markExportStatus(
  ref: RunRef,
  status: "running" | "completed" | "failed",
  error?: string,
) {
  "use step";
  const db = getDb();
  await db
    .update(schema.generationRuns)
    .set({
      status,
      error: error ?? null,
      ...(status === "running" ? { startedAt: new Date() } : { completedAt: new Date() }),
    })
    .where(eq(schema.generationRuns.id, ref.dbRunId));
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

  const blob = await put(
    `exports/${ref.projectId}/${token}.${meta.extension}`,
    Buffer.from(result.buffer),
    {
      access: "public",
      contentType: result.contentType,
      allowOverwrite: true, // step retries re-upload to the same pathname
    },
  );

  const db = getDb();
  const [asset] = await db
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
    .returning({ id: schema.assets.id });

  return { assetId: asset.id, filename: result.filename };
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
    await markExportStatus(ref, "running");
    await emitExportProgress(ref, {
      type: "stage",
      stage: "finalizing",
      pct: 10,
      detail: `Assembling the ${FORMAT_META[format].label} edition`,
    });

    const token = await mintExportToken();
    const { assetId, filename } = await assembleAndUploadStep(ref, format, token);

    await markExportStatus(ref, "completed");
    await emitExportProgress(ref, { type: "stage", stage: "done", pct: 100, detail: filename });
    return { assetId, filename };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    await markExportStatus(ref, "failed", message);
    await emitExportProgress(ref, { type: "error", message, fatal: true });
    throw error instanceof FatalError ? error : new FatalError(message);
  }
}

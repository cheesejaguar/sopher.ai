import { getRun } from "workflow/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { PROGRESS_NS } from "@/lib/run-events";
import type { GenerationConfig } from "@/lib/run-events";
import {
  acquireAuthoringStreamLease,
  releaseAuthoringStreamLease,
} from "@/lib/authoring-stream-leases";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";

export const maxDuration = 300;

/**
 * The two namespaces the workflow actually publishes: the RunEvent progress
 * stream, and one prose-delta channel per chapter. Anything else is either a
 * typo or someone fishing for internal channels.
 */
type ReadableNamespace = { value: string; chapterNumber: number | null };

export function readableNamespace(raw: string | null): ReadableNamespace | null {
  if (raw === null || raw === PROGRESS_NS) {
    return { value: PROGRESS_NS, chapterNumber: null };
  }
  const chapter = raw.match(/^chapter:([1-9]\d{0,3})$/);
  if (!chapter) return null;
  const chapterNumber = Number(chapter[1]);
  return chapterNumber >= 1 ? { value: raw, chapterNumber } : null;
}

export function readableStartIndex(raw: string | null): number | null {
  const value = Number(raw ?? "0");
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * Encode a Workflow readable without leaving its underlying subscription
 * attached after navigation, route cancellation, or a dropped connection.
 * `pipeThrough()` normally propagates cancellation, but an aborted Next.js
 * request can otherwise outlive the downstream reader long enough to retain
 * Workflow listeners across repeated project navigation.
 */
export function asNdjsonReadable<T>(
  source: ReadableStream<T>,
  requestSignal: AbortSignal,
  onClose?: () => void | Promise<void>,
): ReadableStream<Uint8Array> {
  const sourceReader = source.getReader();
  const encoder = new TextEncoder();
  let closed = false;
  let released = false;
  let cancellation: Promise<void> | null = null;
  let cleanup: Promise<void> | null = null;

  const release = () => {
    if (released) return;
    released = true;
    sourceReader.releaseLock();
  };

  const detach = () => {
    requestSignal.removeEventListener("abort", abortSource);
  };

  const cleanupResources = () => {
    cleanup ??= Promise.resolve()
      .then(() => {
        release();
        return onClose?.();
      })
      .catch(() => {});
    return cleanup;
  };

  const cancelSource = async (reason?: unknown) => {
    if (!cancellation) {
      closed = true;
      detach();
      cancellation = sourceReader
        .cancel(reason)
        .catch(() => {})
        .then(cleanupResources);
    }
    await cancellation;
  };

  function abortSource() {
    void cancelSource(requestSignal.reason);
  }

  if (requestSignal.aborted) {
    void cancelSource(requestSignal.reason);
  } else {
    requestSignal.addEventListener("abort", abortSource, { once: true });
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) {
        controller.close();
        return;
      }
      try {
        const { done, value } = await sourceReader.read();
        if (closed) {
          controller.close();
          return;
        }
        if (done) {
          closed = true;
          detach();
          await cleanupResources();
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      } catch (error) {
        if (closed) return;
        await cancelSource(error);
        controller.error(error);
      }
    },
    cancel: cancelSource,
  });
}

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
  // Confined to the caller's own run by the ownership check below, but an
  // arbitrary namespace still exposes internal event channels the UI never
  // asks for. Only the two the client actually reads are accepted.
  const namespace = readableNamespace(url.searchParams.get("ns"));
  if (!namespace) {
    return Response.json({ error: "Unknown namespace" }, { status: 400 });
  }
  const startIndex = readableStartIndex(url.searchParams.get("startIndex"));
  if (startIndex === null) {
    return Response.json({ error: "Invalid stream position" }, { status: 400 });
  }
  const limited = await rateLimit(LIMITS.authoringStream, req, userId);
  if (limited.limited) return limited.response;

  const db = getDb();
  const [run] = await db
    .select({
      workflowRunId: schema.generationRuns.workflowRunId,
      userId: schema.generationRuns.userId,
      config: schema.generationRuns.config,
      targetChapters: schema.projects.targetChapters,
    })
    .from(schema.generationRuns)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.generationRuns.projectId))
    .where(and(eq(schema.generationRuns.id, runId), eq(schema.generationRuns.userId, userId)))
    .limit(1);
  if (!run?.workflowRunId) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }
  const configuredTarget = (run.config as Partial<GenerationConfig>).targetChapters;
  const targetChapters = Math.min(
    9_999,
    Math.max(
      0,
      typeof configuredTarget === "number" && Number.isSafeInteger(configuredTarget)
        ? configuredTarget
        : run.targetChapters,
    ),
  );
  if (namespace.chapterNumber !== null && namespace.chapterNumber > targetChapters) {
    return Response.json({ error: "Unknown chapter namespace" }, { status: 400 });
  }

  const leaseId = await acquireAuthoringStreamLease({
    runId,
    userId,
    namespace: namespace.value,
  });
  if (!leaseId) {
    return Response.json(
      { error: "Too many live authoring streams" },
      { status: 429, headers: { "Retry-After": "5" } },
    );
  }
  const releaseLease = () => releaseAuthoringStreamLease({ id: leaseId, runId, userId });

  let readable: ReadableStream<unknown>;
  try {
    readable = getRun(run.workflowRunId).getReadable({
      namespace: namespace.value,
      startIndex,
    });
  } catch (error) {
    await releaseLease();
    throw error;
  }
  const ndjson = asNdjsonReadable(readable, req.signal, releaseLease);

  return new Response(ndjson, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

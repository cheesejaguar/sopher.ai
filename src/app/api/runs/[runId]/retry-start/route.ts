import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { start } from "workflow/api";

import { getDb, schema } from "@/db";
import {
  markAuthoringRunDispatchReady,
  prepareFullBookRunDispatch,
} from "@/lib/authoring-dispatch";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import {
  claimUncertainAuthoringRun,
  linkAuthoringRunWorkflow,
  markAuthoringRunAcceptanceUncertain,
  settleStubbedAuthoringRunHandoff,
  terminalizeAuthoringRun,
} from "@/lib/generation-runs";
import type { GenerationConfig } from "@/lib/run-events";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { authorizeProjectSpend } from "@/lib/project-spend-http";
import { isE2EWorkflowStubEnabled } from "@/lib/e2e-workflow-stub";
import { generateBook } from "@/workflows/generate-book";
import { generateChapter } from "@/workflows/generate-chapter";

export const maxDuration = 60;

/**
 * Re-dispatches the same durable run only after `start()` acceptance was
 * ambiguous. The marker claim is atomic, so duplicate clicks/reloads reattach
 * while at most one retry invocation is in flight.
 */
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
  try {
    await assertNotSuspended(userId);
  } catch (error) {
    if (error instanceof SuspendedError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const { runId } = await ctx.params;
  if (!z.uuid().safeParse(runId).success) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const db = getDb();
  const [snapshot] = await db
    .select({
      id: schema.generationRuns.id,
      projectId: schema.generationRuns.projectId,
      kind: schema.generationRuns.kind,
      config: schema.generationRuns.config,
      status: schema.generationRuns.status,
      workflowRunId: schema.generationRuns.workflowRunId,
      acceptanceUncertainAt: schema.generationRuns.acceptanceUncertainAt,
      acceptanceDispatchClaimedAt: schema.generationRuns.acceptanceDispatchClaimedAt,
    })
    .from(schema.generationRuns)
    .where(and(eq(schema.generationRuns.id, runId), eq(schema.generationRuns.userId, userId)))
    .limit(1);
  if (!snapshot) return Response.json({ error: "Run not found" }, { status: 404 });

  const claimIsFresh =
    snapshot.acceptanceDispatchClaimedAt &&
    snapshot.acceptanceDispatchClaimedAt.getTime() > Date.now() - 2 * 60_000;
  if (snapshot.workflowRunId) {
    return Response.json(
      {
        runId,
        status: snapshot.status,
        reattached: true,
        handoffConfirmed: true,
        confirmationPending: false,
      },
      { status: 202 },
    );
  }
  if (
    snapshot.status === "completed" ||
    snapshot.status === "failed" ||
    snapshot.status === "cancelled"
  ) {
    return Response.json(
      {
        error: `This run is ${snapshot.status} and cannot be redispatched`,
        runId,
        status: snapshot.status,
        handoffConfirmed: false,
        confirmationPending: false,
      },
      { status: 409 },
    );
  }
  if (snapshot.status !== "queued" || !snapshot.acceptanceUncertainAt) {
    return Response.json(
      {
        error: "This run does not have a retryable uncertain handoff",
        runId,
        status: snapshot.status,
        handoffConfirmed: false,
        confirmationPending: false,
      },
      { status: 409 },
    );
  }

  const spendDenied = await authorizeProjectSpend({
    userId,
    projectId: snapshot.projectId,
    operationKind: snapshot.kind === "full_book" ? "whole_story_start" : "authoring",
  });
  if (spendDenied) return spendDenied;

  if (claimIsFresh) {
    const retryAfter = Math.max(
      1,
      Math.ceil(
        (snapshot.acceptanceDispatchClaimedAt!.getTime() + 2 * 60_000 - Date.now()) / 1_000,
      ),
    );
    return Response.json(
      {
        runId,
        status: snapshot.status,
        reattached: true,
        handoffConfirmed: false,
        confirmationPending: true,
        safeToRetry: false,
        retryAfter,
      },
      { status: 202, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const persistedConfig = (snapshot.config ?? {}) as Partial<GenerationConfig>;
  if (persistedConfig.dispatchReady !== true) {
    let ready: GenerationConfig | null = null;
    if (snapshot.kind === "full_book") {
      ready = await prepareFullBookRunDispatch({ runId, projectId: snapshot.projectId, userId });
    } else if (snapshot.kind === "chapter") {
      const [reservation] = await db
        .select({ externalRef: schema.creditLedger.externalRef })
        .from(schema.creditLedger)
        .where(
          and(
            eq(schema.creditLedger.userId, userId),
            eq(schema.creditLedger.projectId, snapshot.projectId),
            eq(schema.creditLedger.runId, runId),
            sql`${schema.creditLedger.externalRef} like ${`generation-reservation:${runId}:chapter:%`}`,
            sql`not exists (
              select 1 from credit_ledger released
              where released.external_ref = 'release:' || ${schema.creditLedger.externalRef}
            )`,
          ),
        )
        .limit(1);
      if (reservation) {
        ready = await markAuthoringRunDispatchReady({
          runId,
          projectId: snapshot.projectId,
          userId,
          config: persistedConfig as GenerationConfig,
        });
      }
    }
    if (!ready) {
      await terminalizeAuthoringRun({
        runId,
        projectId: snapshot.projectId,
        userId,
        status: "failed",
        error: "Workflow dispatch preparation did not complete",
        releaseImmediately: true,
      });
      return Response.json(
        {
          error: "Writing didn’t begin. No credits were used.",
          runId,
          status: "failed",
          handoffConfirmed: false,
          confirmationPending: false,
          noWorkStarted: true,
        },
        { status: 409 },
      );
    }
  }

  const limited = await rateLimit(LIMITS.bookStart, req, userId);
  if (limited.limited) return limited.response;

  const claimed = await claimUncertainAuthoringRun({
    runId,
    projectId: snapshot.projectId,
    userId,
  });
  if (!claimed) {
    const [current] = await db
      .select({
        status: schema.generationRuns.status,
        workflowRunId: schema.generationRuns.workflowRunId,
        acceptanceUncertainAt: schema.generationRuns.acceptanceUncertainAt,
        acceptanceDispatchClaimedAt: schema.generationRuns.acceptanceDispatchClaimedAt,
      })
      .from(schema.generationRuns)
      .where(and(eq(schema.generationRuns.id, runId), eq(schema.generationRuns.userId, userId)))
      .limit(1);
    if (current?.workflowRunId) {
      return Response.json(
        {
          runId,
          status: current.status,
          reattached: true,
          handoffConfirmed: true,
          confirmationPending: false,
        },
        { status: 202 },
      );
    }
    if (
      current?.status === "completed" ||
      current?.status === "failed" ||
      current?.status === "cancelled"
    ) {
      return Response.json(
        {
          error: `This run is ${current.status} and cannot be redispatched`,
          runId,
          status: current.status,
          handoffConfirmed: false,
          confirmationPending: false,
        },
        { status: 409 },
      );
    }
    return Response.json(
      {
        runId,
        status: current?.status ?? "queued",
        reattached: true,
        handoffConfirmed: false,
        confirmationPending: Boolean(current?.acceptanceUncertainAt),
        safeToRetry: false,
      },
      { status: 202 },
    );
  }

  if (isE2EWorkflowStubEnabled()) {
    const handoffConfirmed = await settleStubbedAuthoringRunHandoff({
      runId,
      projectId: claimed.projectId,
      userId,
    });
    return Response.json(
      {
        runId,
        status: "queued",
        reattached: true,
        handoffConfirmed,
        confirmationPending: !handoffConfirmed,
        stubbed: true,
      },
      { status: handoffConfirmed ? 202 : 409 },
    );
  }

  const config = claimed.config as GenerationConfig;
  let invoke: () => Promise<{ runId: string }>;
  if (claimed.kind === "full_book") {
    invoke = () => start(generateBook, [runId, claimed.projectId, userId, config]);
  } else if (claimed.kind === "chapter") {
    const [reservation] = await db
      .select({ externalRef: schema.creditLedger.externalRef })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.userId, userId),
          eq(schema.creditLedger.projectId, claimed.projectId),
          eq(schema.creditLedger.runId, runId),
          sql`${schema.creditLedger.externalRef} like ${`generation-reservation:${runId}:chapter:%`}`,
          sql`not exists (
            select 1 from credit_ledger released
            where released.external_ref = 'release:' || ${schema.creditLedger.externalRef}
          )`,
        ),
      )
      .limit(1);
    const match = reservation?.externalRef?.match(/:chapter:(\d+)$/);
    const chapterNumber = match ? Number(match[1]) : Number.NaN;
    if (!reservation?.externalRef || !Number.isInteger(chapterNumber) || chapterNumber < 1) {
      await terminalizeAuthoringRun({
        runId,
        projectId: claimed.projectId,
        userId,
        status: "failed",
        error: "Chapter retry reservation was unavailable before Workflow dispatch",
        releaseImmediately: true,
      });
      return Response.json(
        { error: "This chapter run can no longer be started safely" },
        { status: 409 },
      );
    }
    invoke = () =>
      start(generateChapter, [
        runId,
        claimed.projectId,
        userId,
        chapterNumber,
        config,
        reservation.externalRef!,
      ]);
  } else {
    await terminalizeAuthoringRun({
      runId,
      projectId: claimed.projectId,
      userId,
      status: "failed",
      error: `Unsupported uncertain authoring run kind: ${claimed.kind}`,
      releaseImmediately: true,
    });
    return Response.json({ error: "This run cannot be restarted safely" }, { status: 409 });
  }

  try {
    const workflowRun = await invoke();
    const linked = await linkAuthoringRunWorkflow({
      runId,
      projectId: claimed.projectId,
      userId,
      workflowRunId: workflowRun.runId,
    });
    if (!linked) {
      const [current] = await db
        .select({
          status: schema.generationRuns.status,
          workflowRunId: schema.generationRuns.workflowRunId,
          acceptanceUncertainAt: schema.generationRuns.acceptanceUncertainAt,
        })
        .from(schema.generationRuns)
        .where(and(eq(schema.generationRuns.id, runId), eq(schema.generationRuns.userId, userId)))
        .limit(1);
      if (!current?.workflowRunId) {
        return Response.json(
          {
            error: "The durable Workflow handoff could not be confirmed",
            runId,
            status: current?.status ?? "queued",
            handoffConfirmed: false,
            confirmationPending: Boolean(current?.acceptanceUncertainAt),
          },
          { status: 409 },
        );
      }
    }
    return Response.json(
      {
        runId,
        status: "queued",
        reattached: true,
        handoffConfirmed: true,
        confirmationPending: false,
      },
      { status: 202 },
    );
  } catch {
    const confirmationPending = await markAuthoringRunAcceptanceUncertain({
      runId,
      projectId: claimed.projectId,
      userId,
    });
    return Response.json(
      {
        runId,
        status: "queued",
        reattached: true,
        handoffConfirmed: false,
        confirmationPending,
        safeToRetry: confirmationPending,
      },
      { status: 202 },
    );
  }
}

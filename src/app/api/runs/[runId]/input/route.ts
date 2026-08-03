import { resumeHook } from "workflow/api";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getBalance } from "@/lib/billing/credits";
import {
  acceptAuthoringRunInput,
  authoringInputPayloadsEqual,
  authoringInputToken,
  deliverAuthoringRunInput,
} from "@/lib/authoring-inputs";
import { runEventSchema, type GenerationConfig, type Stage } from "@/lib/run-events";
import { creativeDecisionPayloadSchema } from "@/lib/creative-decisions";

export const maxDuration = 30;

const bodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("outline-approval"),
    approved: z.boolean(),
    notes: z.string().max(5_000).optional(),
    requestKey: z.uuid().optional(),
  }),
  // Resumes a run suspended mid-book because the wallet ran short. The balance
  // is re-checked here so a resume cannot be forced without actually paying.
  z.object({ kind: z.literal("credits-topup"), requestKey: z.uuid().optional() }),
  z.object({
    kind: z.literal("creative-decision"),
    questionId: z.uuid(),
    decisionDigest: z.string(),
    mode: z.enum(["option", "custom", "sopher"]),
    selectedOptionId: z.enum(["option-1", "option-2", "option-3"]).optional(),
    customResponse: z.string().optional(),
    requestKey: z.uuid().optional(),
  }),
]);

async function latestValidLegacyStage(
  db: ReturnType<typeof getDb>,
  runId: string,
): Promise<Stage | null> {
  const events = await db
    .select({ payload: schema.generationEvents.payload })
    .from(schema.generationEvents)
    .where(and(eq(schema.generationEvents.runId, runId), eq(schema.generationEvents.type, "stage")))
    .orderBy(desc(schema.generationEvents.seq));
  for (const event of events) {
    const parsed = runEventSchema.safeParse(event.payload);
    if (parsed.success && parsed.data.type === "stage") return parsed.data.stage;
  }
  return null;
}

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
    .select({
      id: schema.generationRuns.id,
      status: schema.generationRuns.status,
      config: schema.generationRuns.config,
      pauseKind: schema.generationRuns.pauseKind,
      pauseVersion: schema.generationRuns.pauseVersion,
      pauseRegisteredAt: schema.generationRuns.pauseRegisteredAt,
      pauseDetails: schema.generationRuns.pauseDetails,
      cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
    })
    .from(schema.generationRuns)
    .where(and(eq(schema.generationRuns.id, runId), eq(schema.generationRuns.userId, userId)))
    .limit(1);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  const protocolVersion = (run.config as Partial<GenerationConfig>).protocolVersion;
  const usesDurableInputs = protocolVersion === 2 || protocolVersion === 3;
  const creativePayload =
    parsed.data.kind === "creative-decision"
      ? creativeDecisionPayloadSchema.safeParse({
          questionId: parsed.data.questionId,
          decisionDigest: parsed.data.decisionDigest,
          mode: parsed.data.mode,
          selectedOptionId: parsed.data.selectedOptionId,
          customResponse: parsed.data.customResponse,
        })
      : null;
  if (creativePayload && !creativePayload.success) {
    return Response.json({ error: creativePayload.error.flatten() }, { status: 400 });
  }
  const durableKind =
    parsed.data.kind === "outline-approval"
      ? "outline_approval"
      : parsed.data.kind === "credits-topup"
        ? "credits_topup"
        : "creative_decision";
  const payload =
    creativePayload?.success === true
      ? creativePayload.data
      : parsed.data.kind === "outline-approval"
        ? {
            approved: parsed.data.approved,
            ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
          }
        : { toppedUp: true };

  // A successful hook delivery can advance the run before the HTTP response
  // reaches the browser. The caller's stable request key must still replay as
  // accepted after that transition, without applying the answer twice.
  if (usesDurableInputs && parsed.data.requestKey) {
    const [existingInput] = await db
      .select({
        kind: schema.authoringRunInputs.kind,
        payload: schema.authoringRunInputs.payload,
        status: schema.authoringRunInputs.status,
      })
      .from(schema.authoringRunInputs)
      .where(
        and(
          eq(schema.authoringRunInputs.runId, runId),
          eq(schema.authoringRunInputs.requestKey, parsed.data.requestKey),
        ),
      )
      .limit(1);
    if (existingInput) {
      if (
        existingInput.kind !== durableKind ||
        !authoringInputPayloadsEqual(existingInput.payload, payload)
      ) {
        return Response.json(
          { error: "This authoring input was already answered differently" },
          { status: 409 },
        );
      }
      if (existingInput.status === "delivered" || existingInput.status === "consumed") {
        return Response.json({
          resumed: true,
          accepted: true,
          replayed: true,
          delivery: existingInput.status === "consumed" ? "already_consumed" : "already_delivered",
          protocolVersion,
        });
      }
    }
  }

  if (run.status !== "awaiting_input") {
    return Response.json({ error: "Run is not waiting for input" }, { status: 409 });
  }
  if (run.cancellationRequestedAt) {
    return Response.json(
      {
        error: "This run is stopping and cannot accept more input",
        code: "cancellation_requested",
      },
      { status: 409 },
    );
  }

  if (!usesDurableInputs) {
    if (parsed.data.kind === "creative-decision") {
      return Response.json({ error: "Run is not waiting for this input" }, { status: 409 });
    }
    const stage = await latestValidLegacyStage(db, runId);
    const expectedStage =
      parsed.data.kind === "outline-approval" ? "awaiting_approval" : "awaiting_credits";
    if (stage !== expectedStage) {
      return Response.json({ error: "Run is not waiting for this input" }, { status: 409 });
    }

    if (parsed.data.kind === "credits-topup") {
      const balance = await getBalance(userId);
      if (balance <= 0) {
        return Response.json({ error: "Add credits before resuming", balance }, { status: 402 });
      }
      await resumeHook(`credits-topup:${runId}`, { toppedUp: true });
      return Response.json({ resumed: true, balance, protocolVersion: 1 });
    }

    // Legacy hooks carry their payload directly, so persist the author's
    // revision note immediately before signaling the pinned workflow.
    if (parsed.data.notes) {
      await db
        .update(schema.generationRuns)
        .set({ approvalNotes: parsed.data.notes })
        .where(eq(schema.generationRuns.id, runId));
    }
    await resumeHook(`outline-approval:${runId}`, {
      approved: parsed.data.approved,
      notes: parsed.data.notes,
    });
    return Response.json({ resumed: true, protocolVersion: 1 });
  }

  if (parsed.data.kind === "credits-topup") {
    const balance = await getBalance(userId);
    const requiredCredits = run.pauseDetails?.requiredCredits;
    if (
      typeof requiredCredits !== "number" ||
      !Number.isFinite(requiredCredits) ||
      requiredCredits <= 0
    ) {
      return Response.json(
        { error: "This credit pause is missing its saved requirement. Contact support." },
        { status: 409 },
      );
    }
    if (balance < requiredCredits) {
      return Response.json(
        {
          error: `Add ${(requiredCredits - balance).toFixed(2)} more credits before resuming`,
          balance,
          required: requiredCredits,
        },
        { status: 402 },
      );
    }
  }

  if (creativePayload?.success) {
    const checked = creativePayload;
    const [question] = await db
      .select({
        id: schema.authoringQuestions.id,
        decisionDigest: schema.authoringQuestions.decisionDigest,
        options: schema.authoringQuestions.options,
        pauseVersion: schema.authoringQuestions.pauseVersion,
        status: schema.authoringQuestions.status,
      })
      .from(schema.authoringQuestions)
      .where(
        and(
          eq(schema.authoringQuestions.id, checked.data.questionId),
          eq(schema.authoringQuestions.runId, runId),
        ),
      )
      .limit(1);
    const selectedOptionIsValid =
      checked.data.mode !== "option" ||
      question?.options.some((option) => option.id === checked.data.selectedOptionId);
    if (
      !question ||
      question.status !== "pending" ||
      question.pauseVersion !== run.pauseVersion ||
      question.decisionDigest !== checked.data.decisionDigest ||
      run.pauseDetails?.questionId !== question.id ||
      !selectedOptionIsValid
    ) {
      return Response.json(
        {
          error: "This story question changed. Review the latest directions and choose again.",
          code: "stale_creative_question",
        },
        { status: 409 },
      );
    }
  }
  if (run.pauseKind !== durableKind || !run.pauseRegisteredAt || run.pauseVersion < 1) {
    return Response.json({ error: "Run is not waiting for this input" }, { status: 409 });
  }
  let accepted: Awaited<ReturnType<typeof acceptAuthoringRunInput>>;
  try {
    accepted = await acceptAuthoringRunInput({
      runId,
      userId,
      kind: durableKind,
      pauseVersion: run.pauseVersion,
      payload,
      requestKey: parsed.data.requestKey,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Input could not be accepted" },
      { status: 409 },
    );
  }

  // For v2, the durable row wins. Persist only the already accepted payload so
  // a conflicting retry cannot overwrite the original author instruction
  // before receiving its 409 response.
  const acceptedNotes = accepted.input.payload.notes;
  if (parsed.data.kind === "outline-approval" && typeof acceptedNotes === "string") {
    await db
      .update(schema.generationRuns)
      .set({ approvalNotes: acceptedNotes })
      .where(eq(schema.generationRuns.id, runId));
  }

  try {
    const delivery = await deliverAuthoringRunInput({
      inputId: accepted.input.id,
      token: authoringInputToken({
        runId,
        kind: durableKind,
        pauseVersion: run.pauseVersion,
      }),
    });
    return Response.json({
      resumed: true,
      accepted: true,
      replayed: accepted.replayed,
      delivery,
      ...(parsed.data.kind === "credits-topup" ? { balance: await getBalance(userId) } : {}),
      protocolVersion,
    });
  } catch {
    // The input is durable. A retry or evidence-gated watchdog redelivery can
    // safely signal the same input id without asking the author again.
    return Response.json(
      {
        resumed: false,
        accepted: true,
        replayed: accepted.replayed,
        deliveryPending: true,
        protocolVersion,
      },
      { status: 202 },
    );
  }
}

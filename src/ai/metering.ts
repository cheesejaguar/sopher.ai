import { NoObjectGeneratedError, type JSONValue, type LanguageModelUsage } from "ai";
import {
  abortMeteredCallIntent,
  attachGatewayGenerationIds,
  beginMeteredCallIntent,
  recordLlmCallsAndDebit,
  releaseOptionalOperationLeases,
  releaseReplayedOptionalOperationLeases,
  refundSettledLogicalUsageForRedo,
} from "@/lib/billing/meter";
import { grantCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import {
  MeteredInputLimitError,
  meteredOperationCeilingCredits,
  meteredOperationCeilingUsd,
} from "./metering-limits";
import { ProjectSpendAccessError } from "@/lib/project-spend-access";
import { optionalDeliveryLeasePrefix } from "@/lib/billing/optional-delivery";
import {
  AuthoringCancellationRequestedError,
  AuthoringRunInactiveError,
  throwIfAuthoringCancellationRequested,
} from "@/lib/authoring-cancellation";
import { PROSE_FALLBACK_MODELS } from "./models";

/**
 * Mutable state for one sequential metered operation. Do not share a MeterCtx
 * across concurrent `metered()` calls; each provider attempt writes its own
 * attempt tag and settlement result into this object.
 */
export type MeterCtx = {
  userId: string;
  projectId?: string | null;
  runId?: string | null;
  /**
   * Stable logical-work key supplied by durable workflow steps. Provider calls
   * are still recorded individually, but a retried logical call debits the
   * author's wallet only once through credit_ledger.external_ref.
   */
  billingScope?: string;
  /**
   * Conservative authorization for an interactive (non-workflow) call.
   * Metered calls without a durable phase reservation must provide this.
   */
  authorizationUsd?: number;
  /** Caller-stable UUID for one intentional interactive paid action. */
  idempotencyKey?: string;
  /**
   * Exact phase/call hold that authorizes this provider work. Workflow scopes
   * receive it from their just-in-time gate; interactive calls create one here.
   */
  reservationRef?: string;
  /** Unique provider-attempt tag, populated by metered() before `fn` runs. */
  meteringAttemptId?: string;
  /** Populated only after the provider result and atomic ledger settlement commit. */
  lastSettlement?: {
    meteredUsd: number;
    credits: number;
    externalRefPrefix: string;
  };
  /** Optional shared collector for multi-call interactive operations. */
  settlements?: Array<{
    meteredUsd: number;
    credits: number;
    externalRefPrefix: string;
  }>;
  /** Project mutation leases held until optional output is delivered/refunded. */
  optionalOperationLeaseRefs?: string[];
  /**
   * Exact zero-value ledger receipt committed atomically with optional output.
   * Omit for authoring calls and legacy optional routes that own another replay
   * contract.
   */
  deliveryReceiptRef?: string;
};

/**
 * Gateway provider options for a metered call: per-user attribution, role/project
 * tags for the Gateway dashboard, automatic prompt caching, and (for prose calls)
 * a same-family fallback chain.
 */
export function gatewayOptions(
  ctx: MeterCtx,
  role: string,
  opts?: { withFallbacks?: boolean },
): {
  gateway: Record<string, JSONValue>;
  anthropic: Record<string, JSONValue>;
} {
  return {
    gateway: {
      user: ctx.userId,
      tags: [
        `role:${role}`,
        ...(ctx.projectId ? [`project:${ctx.projectId}`] : []),
        ...(ctx.meteringAttemptId ? [`attempt:${ctx.meteringAttemptId}`] : []),
      ],
      caching: "auto",
      ...(opts?.withFallbacks ? { models: PROSE_FALLBACK_MODELS } : {}),
    },
    // Sonnet 5 enables thinking by default. This is deliberately a blanket
    // metering policy: our output ceilings are sized for author-facing
    // JSON/prose, so implicit reasoning can otherwise consume the allowance
    // before any deliverable output is produced. A future operation that needs
    // extended thinking must opt into it with a separately budgeted contract.
    anthropic: {
      thinking: { type: "disabled" },
    },
  };
}

export type MeteredCallInfo = {
  role: string;
  operation: string;
  model: string;
  /** When runtime has a tighter enforced cap than the operation maximum. */
  maxOutputTokens?: number;
};

export class MeteringReconciliationRequiredError extends Error {
  readonly isRetryable = false;

  constructor(
    readonly intentRef: string,
    readonly state: "pending" | "settled",
  ) {
    super(
      state === "settled"
        ? "This logical provider call was already settled but its output checkpoint is missing. The call was not repeated."
        : "A prior provider attempt has unresolved local metering. The call was not repeated; reconciliation is required.",
    );
    this.name = "MeteringReconciliationRequiredError";
  }
}

export class MeteredDeliveryPendingError extends Error {
  readonly isRetryable = true;

  constructor(readonly receiptRef: string) {
    super("This request is already finishing. Retry shortly with the same request key.");
    this.name = "MeteredDeliveryPendingError";
  }
}

export class MeteredDeliveryReplayError extends Error {
  readonly isRetryable = true;

  constructor(readonly receiptRef: string) {
    super("This request was already delivered. Load its durable result instead of repeating it.");
    this.name = "MeteredDeliveryReplayError";
  }
}

export class MeteredOutputDeliveryError extends Error {
  readonly isRetryable: boolean;

  constructor(
    readonly operation: string,
    readonly finishReason: string,
    readonly outputTokens: number,
    readonly reasoningTokens: number,
  ) {
    const usageDetail = [
      outputTokens > 0 ? `${outputTokens} output tokens` : null,
      reasoningTokens > 0 ? `${reasoningTokens} reasoning tokens` : null,
    ]
      .filter(Boolean)
      .join(", ");
    super(
      `${operation} ended before a complete result was available` +
        ` (finish reason: ${finishReason}${usageDetail ? `; ${usageDetail}` : ""}).`,
    );
    this.name = "MeteredOutputDeliveryError";
    this.isRetryable = finishReason !== "length" && finishReason !== "content-filter";
  }
}

type UsageCarrier = {
  usage?: LanguageModelUsage;
  response?: { modelId?: string; providerMetadata?: unknown };
  responses?: Array<{ modelId?: string; providerMetadata?: unknown }>;
  providerMetadata?: unknown;
};

function gatewayGenerationId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const gateway = (value as { gateway?: unknown }).gateway;
  if (!gateway || typeof gateway !== "object") return undefined;
  const id = (gateway as { generationId?: unknown }).generationId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function actualCalls<T extends { usage: LanguageModelUsage }>(
  result: T,
  requestedModel: string,
): Array<{ usage: LanguageModelUsage; model: string; generationId?: string }> {
  const carriers =
    "steps" in result &&
    Array.isArray((result as { steps?: unknown[] }).steps) &&
    (result as { steps: unknown[] }).steps.length > 0
      ? ((result as { steps: UsageCarrier[] }).steps ?? [])
      : [result as UsageCarrier];
  return carriers
    .filter((carrier): carrier is UsageCarrier & { usage: LanguageModelUsage } =>
      Boolean(carrier.usage),
    )
    .map((carrier) => {
      const generationId =
        gatewayGenerationId(carrier.providerMetadata) ??
        gatewayGenerationId(carrier.response?.providerMetadata) ??
        carrier.responses
          ?.map((response) => gatewayGenerationId(response.providerMetadata))
          .find((id): id is string => Boolean(id));
      const responseModel =
        carrier.response?.modelId ??
        carrier.responses?.findLast((response) => Boolean(response.modelId))?.modelId;
      return {
        usage: carrier.usage,
        model: responseModel || requestedModel,
        ...(generationId ? { generationId } : {}),
      };
    });
}

/**
 * A provider call claims this model/token ceiling before it starts. Expected
 * book pricing is intentionally separate; this is a hard wallet authorization
 * bound, priced against the costliest configured fallback.
 */
export function meteredCallAuthorizationUsd(ctx: MeterCtx, info: MeteredCallInfo): number {
  return meteredOperationCeilingUsd({
    model: info.model,
    operation: info.operation,
    minimumUsd: ctx.authorizationUsd,
    maxOutputTokensPerStep: info.maxOutputTokens,
  });
}

export function meteredCallAuthorizationCredits(ctx: MeterCtx, info: MeteredCallInfo): number {
  return meteredOperationCeilingCredits({
    model: info.model,
    operation: info.operation,
    minimumUsd: ctx.authorizationUsd,
    maxOutputTokensPerStep: info.maxOutputTokens,
  });
}

/** Exact, idempotent refund when settled provider output cannot be delivered. */
export async function refundMeteredDelivery(ctx: MeterCtx, description: string): Promise<boolean> {
  const settlement = ctx.lastSettlement;
  if (!settlement) {
    throw new Error("Cannot refund provider work before its metered settlement commits");
  }
  const refunded = await grantCredits({
    userId: ctx.userId,
    credits: settlement.credits,
    description,
    externalRef: `delivery-refund:${settlement.externalRefPrefix}`,
    kind: "adjustment",
  });
  await completeMeteredDelivery(ctx);
  return refunded;
}

export async function refundMeteredDeliveries(ctx: MeterCtx, description: string): Promise<number> {
  const settlements = ctx.settlements ?? (ctx.lastSettlement ? [ctx.lastSettlement] : []);
  if (settlements.length === 0) return 0;
  const results = await Promise.all(
    settlements.map((settlement) =>
      grantCredits({
        userId: ctx.userId,
        credits: settlement.credits,
        description,
        externalRef: `delivery-refund:${settlement.externalRefPrefix}`,
        kind: "adjustment",
      }),
    ),
  );
  await completeMeteredDelivery(ctx);
  return results.filter(Boolean).length;
}

/** Marks optional AI output durably delivered and releases its project lease. */
export async function completeMeteredDelivery(ctx: MeterCtx): Promise<void> {
  const leaseRefs = ctx.optionalOperationLeaseRefs ?? [];
  if (leaseRefs.length === 0) return;
  await releaseOptionalOperationLeases({
    userId: ctx.userId,
    projectId: ctx.projectId,
    leaseRefs,
  });
  ctx.optionalOperationLeaseRefs = [];
}

export async function healReplayedMeteredDelivery(input: {
  userId: string;
  projectId: string;
  idempotencyKey: string;
  deliveryReceiptRef?: string;
  meteringIdempotencyKey?: string;
}): Promise<void> {
  try {
    await releaseReplayedOptionalOperationLeases({
      ...input,
      ...(input.meteringIdempotencyKey
        ? {
            optionalLeasePrefix: optionalDeliveryLeasePrefix({
              userId: input.userId,
              meteringIdempotencyKey: input.meteringIdempotencyKey,
            }),
          }
        : {}),
    });
  } catch (error) {
    // The generation-start reconciliation performs the same proof under the
    // project lock, so a transient replay repair failure must not hide output
    // already delivered to the author.
    console.error("Could not repair optional operation lease during replay", {
      projectId: input.projectId,
      idempotencyKey: input.idempotencyKey,
      error,
    });
  }
}

/**
 * Wraps one LLM call: pre-flight budget check, latency timing, and an
 * llm_calls row from the returned usage. The AI call itself stays in the
 * caller so generateText/streamText generics and options are unconstrained.
 */
export async function metered<T extends { usage: LanguageModelUsage }>(
  ctx: MeterCtx,
  info: MeteredCallInfo,
  fn: () => Promise<T>,
): Promise<T> {
  if (ctx.billingScope && !ctx.reservationRef) {
    throw new Error(`Metered workflow operation ${info.operation} is missing its reservation`);
  }

  const logicalScope =
    ctx.billingScope ??
    (ctx.idempotencyKey
      ? `interactive:${ctx.userId}:${ctx.idempotencyKey}`
      : `interactive:${crypto.randomUUID()}`);
  const attemptId = crypto.randomUUID();
  ctx.meteringAttemptId = attemptId;
  const intentPrefix = `metering-intent:${logicalScope}:${info.operation}:attempt:`;
  const intentRef = `${intentPrefix}${attemptId}`;
  const usagePrefix = `llm:${logicalScope}:${info.operation}:`;
  const maximumCredits = meteredCallAuthorizationCredits(ctx, info);
  // Preserve a stop request as the primary result even if entitlement or
  // wallet state also changed. The atomic intent statement repeats this gate
  // to close the race between this read and claim insertion.
  await throwIfAuthoringCancellationRequested(ctx.runId);
  const intent = await beginMeteredCallIntent({
    userId: ctx.userId,
    projectId: ctx.projectId,
    runId: ctx.runId,
    intentRef,
    intentPrefix,
    usagePrefix,
    deliveryReceiptRef: ctx.deliveryReceiptRef,
    parentReservationRef: ctx.reservationRef,
    maxCredits: maximumCredits,
    description: `Metering intent for ${info.operation}`,
  });
  if (intent.status === "insufficient") {
    throw new InsufficientCreditsError(intent.balance, intent.required);
  }
  if (intent.status === "trial_cap") {
    throw new ProjectSpendAccessError(
      "included_allowance_exhausted",
      "The included-story allowance was exhausted unexpectedly. Your saved work is safe; contact support with the run reference.",
    );
  }
  if (intent.status === "project_busy") {
    throw new ProjectSpendAccessError(
      "trial_busy",
      "Finish the current authoring run before using optional AI tools",
    );
  }
  if (intent.status === "suspended") {
    throw new ProjectSpendAccessError(
      "suspended",
      "This account is suspended and cannot use authoring tools",
    );
  }
  if (intent.status === "cancelled") {
    throw new AuthoringCancellationRequestedError();
  }
  if (intent.status === "run_inactive") {
    throw new AuthoringRunInactiveError();
  }
  if (intent.status === "delivered") {
    throw new MeteredDeliveryReplayError(ctx.deliveryReceiptRef ?? intentRef);
  }
  if (intent.status === "delivery_pending") {
    throw new MeteredDeliveryPendingError(ctx.deliveryReceiptRef ?? intentRef);
  }
  if (intent.status === "settled") {
    const optionalLeasePrefix =
      ctx.projectId && !ctx.runId && ctx.idempotencyKey
        ? optionalDeliveryLeasePrefix({
            userId: ctx.userId,
            meteringIdempotencyKey: ctx.idempotencyKey,
          })
        : undefined;
    const compensated = await refundSettledLogicalUsageForRedo({
      userId: ctx.userId,
      usagePrefix,
      projectId: ctx.projectId,
      deliveryReceiptRef: ctx.deliveryReceiptRef,
      optionalLeasePrefix,
    });
    if (compensated) return metered(ctx, info, fn);
    throw new MeteringReconciliationRequiredError(intentRef, "settled");
  }
  if (intent.status !== "started") {
    throw new MeteringReconciliationRequiredError(intentRef, intent.status);
  }
  if (intent.optionalLeaseRef) {
    (ctx.optionalOperationLeaseRefs ??= []).push(intent.optionalLeaseRef);
  }

  const abortKnownUnsent = async () => {
    try {
      await abortMeteredCallIntent({
        userId: ctx.userId,
        intentRef,
        reservationRef: intent.reservationRef,
        projectId: ctx.projectId,
        runId: ctx.runId,
      });
    } catch {
      // The child claim remains fail-closed if even the proven-local abort
      // cannot be persisted.
    }
  };

  const startedAt = Date.now();
  const settleProviderUsage = async (input: {
    carrier: UsageCarrier & { usage: LanguageModelUsage };
    imageCount?: number;
    outputDeliveryFailure?: unknown;
  }) => {
    const calls = actualCalls(input.carrier, info.model);
    if (calls.length === 0) {
      calls.push({ usage: input.carrier.usage, model: info.model });
    }
    const generationIds = calls.flatMap((call) => (call.generationId ? [call.generationId] : []));
    await attachGatewayGenerationIds({
      userId: ctx.userId,
      externalRef: intentRef,
      generationIds,
    });
    const externalRefPrefix = `llm:${logicalScope}:${info.operation}:attempt:${attemptId}`;
    const settlementResult = await recordLlmCallsAndDebit(
      calls.map((call, index) => ({
        userId: ctx.userId,
        projectId: ctx.projectId,
        runId: ctx.runId,
        agentRole: info.role,
        operation: info.operation,
        model: call.model,
        usage: {
          inputTokens: call.usage.inputTokens ?? 0,
          outputTokens: call.usage.outputTokens ?? 0,
          cachedInputTokens: call.usage.inputTokenDetails?.cacheReadTokens ?? 0,
          cacheWriteTokens: call.usage.inputTokenDetails?.cacheWriteTokens ?? 0,
          reasoningTokens: call.usage.outputTokenDetails?.reasoningTokens ?? 0,
          imageCount: index === calls.length - 1 ? (input.imageCount ?? 0) : 0,
        },
        latencyMs: Date.now() - startedAt,
      })),
      {
        description: info.operation,
        externalRefPrefix,
        intentRef,
        reservationRef: intent.reservationRef,
        ...(input.outputDeliveryFailure
          ? {
              compensateDelivery: {
                description: `Provider output for ${info.operation} was incomplete and not delivered`,
              },
            }
          : {}),
      },
    );
    const settlement = {
      meteredUsd: settlementResult.meteredUsd,
      credits: settlementResult.debitedCredits,
      externalRefPrefix,
    };
    ctx.lastSettlement = settlement;
    ctx.settlements?.push(settlement);
  };
  let providerPromise: Promise<T>;
  try {
    // Cancellation may arrive after a phase hold was granted but before this
    // provider attempt is dispatched. Re-check at the last local boundary and
    // release the untouched intent when the author has asked us to stop.
    await throwIfAuthoringCancellationRequested(ctx.runId);
    // A synchronous throw proves dispatch never returned a provider promise.
    // Once a promise exists, a rejection is normally ambiguous (the Gateway
    // may have accepted or partially streamed it). AI SDK structured-output
    // errors are the narrow exception because they carry completed usage.
    providerPromise = fn();
  } catch (error) {
    await abortKnownUnsent();
    throw error;
  }

  try {
    const result = await providerPromise;
    let outputDeliveryFailure: unknown;
    if ("output" in result) {
      try {
        // AI SDK v7 exposes completed structured output through a getter that
        // throws when the provider stopped before a complete result could be
        // parsed. Treat any getter failure as an undelivered result so billing
        // cannot settle without usable output; the regression test deliberately
        // locks this SDK contract.
        void (result as T & { output: unknown }).output;
      } catch (error) {
        outputDeliveryFailure = error;
      }
    }
    // Image models bill per generated image, not per token — count returned image files.
    const imageCount =
      (result as { files?: Array<{ mediaType?: string }> }).files?.filter((f) =>
        f.mediaType?.startsWith("image/"),
      ).length ?? 0;
    await settleProviderUsage({
      carrier: result,
      imageCount,
      outputDeliveryFailure,
    });

    if (outputDeliveryFailure) {
      const finishReason =
        "finishReason" in result && typeof result.finishReason === "string"
          ? result.finishReason
          : "unknown";
      throw new MeteredOutputDeliveryError(
        info.operation,
        finishReason,
        result.usage.outputTokens ?? 0,
        result.usage.outputTokenDetails?.reasoningTokens ?? 0,
      );
    }

    await throwIfAuthoringCancellationRequested(ctx.runId);
    return result;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error) && error.usage) {
      // AI SDK rejects generateText(Output.object(...)) after the provider has
      // returned when its response cannot be parsed or validated. The usage
      // attached to this error is authoritative: settle and compensate it so
      // Workflow can safely retry the structured output instead of mistaking
      // its own completed attempt for unresolved external billing.
      await settleProviderUsage({
        carrier: {
          usage: error.usage,
          ...(error.response ? { response: error.response } : {}),
        },
        outputDeliveryFailure: error,
      });
      throw new MeteredOutputDeliveryError(
        info.operation,
        error.finishReason ?? "unknown",
        error.usage.outputTokens ?? 0,
        error.usage.outputTokenDetails?.reasoningTokens ?? 0,
      );
    }
    if (error instanceof MeteredInputLimitError && error.stepNumber === 0) {
      // AI SDK prepareStep runs before the corresponding provider request.
      // A first-step guard failure therefore proves no model call was sent.
      await abortKnownUnsent();
      throw error;
    }
    // Every other provider rejection, stream interruption, generation-id
    // write failure, and settlement failure remains ambiguous after dispatch.
    // Keep the claim and intent pending for operator reconciliation against
    // the unique Gateway attempt tag.
    throw error;
  }
}

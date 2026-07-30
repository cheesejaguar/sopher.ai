import type { JSONValue, LanguageModelUsage } from "ai";
import {
  abortMeteredCallIntent,
  attachGatewayGenerationIds,
  beginMeteredCallIntent,
  recordLlmCallsAndDebit,
  refundSettledLogicalUsageForRedo,
} from "@/lib/billing/meter";
import { grantCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import {
  MeteredInputLimitError,
  meteredOperationCeilingCredits,
  meteredOperationCeilingUsd,
} from "./metering-limits";
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
): { gateway: Record<string, JSONValue> } {
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
  return grantCredits({
    userId: ctx.userId,
    credits: settlement.credits,
    description,
    externalRef: `delivery-refund:${settlement.externalRefPrefix}`,
    kind: "adjustment",
  });
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
  return results.filter(Boolean).length;
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
  const intent = await beginMeteredCallIntent({
    userId: ctx.userId,
    projectId: ctx.projectId,
    runId: ctx.runId,
    intentRef,
    intentPrefix,
    usagePrefix,
    parentReservationRef: ctx.reservationRef,
    maxCredits: maximumCredits,
    description: `Metering intent for ${info.operation}`,
  });
  if (intent.status === "insufficient") {
    throw new InsufficientCreditsError(intent.balance, intent.required);
  }
  if (intent.status === "settled") {
    const compensated = await refundSettledLogicalUsageForRedo({
      userId: ctx.userId,
      usagePrefix,
    });
    if (compensated) return metered(ctx, info, fn);
    throw new MeteringReconciliationRequiredError(intentRef, "settled");
  }
  if (intent.status !== "started") {
    throw new MeteringReconciliationRequiredError(intentRef, intent.status);
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
  let providerPromise: Promise<T>;
  try {
    // A synchronous throw proves dispatch never returned a provider promise.
    // Once a promise exists, every rejection is ambiguous (the Gateway may
    // have accepted or partially streamed it) and must remain held for
    // generation-tag reconciliation.
    providerPromise = fn();
  } catch (error) {
    await abortKnownUnsent();
    throw error;
  }

  try {
    const result = await providerPromise;
    // Image models bill per generated image, not per token — count returned image files.
    const imageCount =
      (result as { files?: Array<{ mediaType?: string }> }).files?.filter((f) =>
        f.mediaType?.startsWith("image/"),
      ).length ?? 0;
    const calls = actualCalls(result, info.model);
    if (calls.length === 0) {
      calls.push({ usage: result.usage, model: info.model });
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
          imageCount: index === calls.length - 1 ? imageCount : 0,
        },
        latencyMs: Date.now() - startedAt,
      })),
      {
        description: info.operation,
        externalRefPrefix,
        intentRef,
        reservationRef: intent.reservationRef,
      },
    );
    const settlement = {
      meteredUsd: settlementResult.meteredUsd,
      credits: settlementResult.debitedCredits,
      externalRefPrefix,
    };
    ctx.lastSettlement = settlement;
    ctx.settlements?.push(settlement);

    return result;
  } catch (error) {
    if (error instanceof MeteredInputLimitError && error.stepNumber === 0) {
      // AI SDK prepareStep runs before the corresponding provider request.
      // A first-step guard failure therefore proves no model call was sent.
      await abortKnownUnsent();
      throw error;
    }
    // Provider promise rejection, stream interruption, generation-id write
    // failure, and settlement failure are all ambiguous after dispatch. Keep
    // the claim and intent pending; an operator can reconcile it against the
    // unique Gateway attempt tag.
    throw error;
  }
}

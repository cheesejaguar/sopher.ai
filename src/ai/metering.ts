import type { JSONValue, LanguageModelUsage } from "ai";
import { recordLlmCall } from "@/lib/billing/meter";
import { assertAboveFloor, debitCredits } from "@/lib/billing/credits";
import { PROSE_FALLBACK_MODELS } from "./models";

export type MeterCtx = {
  userId: string;
  projectId?: string | null;
  runId?: string | null;
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
      tags: [`role:${role}`, ...(ctx.projectId ? [`project:${ctx.projectId}`] : [])],
      caching: "auto",
      ...(opts?.withFallbacks ? { models: PROSE_FALLBACK_MODELS } : {}),
    },
  };
}

export type MeteredCallInfo = {
  role: string;
  operation: string;
  model: string;
};

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
  // The credit system gates at route/workflow level; this is only the backstop
  // that keeps the deliberate mid-wave overshoot bounded.
  await assertAboveFloor(ctx.userId);
  const startedAt = Date.now();
  const result = await fn();
  // Image models bill per generated image, not per token — count returned image files.
  const imageCount =
    (result as { files?: Array<{ mediaType?: string }> }).files?.filter((f) =>
      f.mediaType?.startsWith("image/"),
    ).length ?? 0;
  const usd = await recordLlmCall({
    userId: ctx.userId,
    projectId: ctx.projectId,
    runId: ctx.runId,
    agentRole: info.role,
    operation: info.operation,
    model: info.model,
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
      cacheWriteTokens: result.usage.inputTokenDetails?.cacheWriteTokens ?? 0,
      reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens ?? 0,
      imageCount,
    },
    latencyMs: Date.now() - startedAt,
  });

  // Debit the wallet from the same place the cost is recorded, so the ledger
  // and llm_calls can never disagree about what was spent.
  await debitCredits({
    userId: ctx.userId,
    meteredUsd: usd,
    description: info.operation,
    projectId: ctx.projectId ?? undefined,
    runId: ctx.runId ?? undefined,
  });

  return result;
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  recordMany: vi.fn(),
  attachGenerationIds: vi.fn(),
  abort: vi.fn(),
  refundSettled: vi.fn(),
  grant: vi.fn(),
}));

vi.mock("@/lib/billing/meter", () => ({
  beginMeteredCallIntent: mocks.begin,
  recordLlmCallsAndDebit: mocks.recordMany,
  attachGatewayGenerationIds: mocks.attachGenerationIds,
  abortMeteredCallIntent: mocks.abort,
  refundSettledLogicalUsageForRedo: mocks.refundSettled,
}));

vi.mock("@/lib/billing/credits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/credits")>();
  return { ...actual, grantCredits: mocks.grant };
});

import { InsufficientCreditsError } from "@/lib/billing/credits";
import { MeteredInputLimitError } from "./metering-limits";
import {
  MeteringReconciliationRequiredError,
  metered,
  refundMeteredDeliveries,
  refundMeteredDelivery,
} from "./metering";

const usage = {
  inputTokens: 1_000,
  outputTokens: 500,
  totalTokens: 1_500,
  inputTokenDetails: { noCacheTokens: 1_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokenDetails: { textTokens: 500, reasoningTokens: 0 },
};

function startedIntent() {
  return {
    status: "started" as const,
    balance: 10,
    required: 1,
    intentRef: "metering-intent:scope:operation:attempt:one",
    reservationRef: "metering-claim:metering-intent:scope:operation:attempt:one",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.begin.mockResolvedValue(startedIntent());
  mocks.recordMany.mockResolvedValue({ meteredUsd: 0.01, debitedCredits: 0.0275 });
  mocks.attachGenerationIds.mockResolvedValue(undefined);
  mocks.abort.mockResolvedValue(undefined);
  mocks.refundSettled.mockResolvedValue(true);
  mocks.grant.mockResolvedValue(true);
});

describe("metered atomic authorization", () => {
  it("claims an interactive maximum before provider work and settles through that exact claim", async () => {
    const provider = vi.fn(async () => ({ usage }));

    await expect(
      metered(
        { userId: "user-1", projectId: "project-1", authorizationUsd: 0.1 },
        {
          role: "editor",
          operation: "editor.selection",
          model: "anthropic/claude-haiku-4.5",
        },
        provider,
      ),
    ).resolves.toEqual({ usage });

    expect(mocks.begin).toHaveBeenCalledOnce();
    expect(mocks.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        projectId: "project-1",
        parentReservationRef: undefined,
        maxCredits: expect.any(Number),
      }),
    );
    expect(mocks.begin.mock.calls[0][0].maxCredits).toBeGreaterThanOrEqual(0.275);
    expect(provider).toHaveBeenCalledOnce();
    const intentInput = mocks.begin.mock.calls[0][0];
    expect(mocks.recordMany).toHaveBeenCalledWith(
      [expect.objectContaining({ model: "anthropic/claude-haiku-4.5", usage: expect.anything() })],
      expect.objectContaining({
        intentRef: intentInput.intentRef,
        reservationRef: startedIntent().reservationRef,
      }),
    );
    expect(mocks.abort).not.toHaveBeenCalled();
  });

  it("lets only an atomically authorized concurrent call reach the provider", async () => {
    let available = true;
    mocks.begin.mockImplementation(async () => {
      if (available) {
        available = false;
        return startedIntent();
      }
      return {
        ...startedIntent(),
        status: "insufficient" as const,
        balance: 0,
        required: 1,
      };
    });
    const provider = vi.fn(async () => ({ usage }));
    const calls = Array.from({ length: 6 }, () =>
      metered(
        { userId: "user-1", authorizationUsd: 0.1 },
        { role: "editor", operation: "editor.selection", model: "anthropic/claude-haiku-4.5" },
        provider,
      ),
    );
    const results = await Promise.allSettled(calls);

    expect(provider).toHaveBeenCalledOnce();
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected).toHaveLength(5);
    expect(rejected.every((result) => result.reason instanceof InsufficientCreditsError)).toBe(
      true,
    );
  });

  it("records actual fallback models and per-step usage in one settlement", async () => {
    const firstUsage = { ...usage, inputTokens: 2_000 };
    const fallbackUsage = { ...usage, outputTokens: 900 };
    const result = {
      usage: {
        ...usage,
        inputTokens: 3_000,
        outputTokens: 1_400,
      },
      steps: [
        {
          usage: firstUsage,
          response: {
            modelId: "anthropic/claude-sonnet-5",
            providerMetadata: { gateway: { generationId: "gen-primary" } },
          },
        },
        {
          usage: fallbackUsage,
          response: {
            modelId: "anthropic/claude-sonnet-4.6",
            providerMetadata: { gateway: { generationId: "gen-fallback" } },
          },
        },
      ],
    };

    await metered(
      {
        userId: "user-1",
        runId: "run-1",
        billingScope: "generation:run-1:chapter:1",
        reservationRef: "generation-reservation:run-1:wave-1",
      },
      { role: "writer", operation: "writer.draft", model: "anthropic/claude-sonnet-5" },
      async () => result,
    );

    expect(mocks.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        parentReservationRef: "generation-reservation:run-1:wave-1",
      }),
    );
    expect(mocks.recordMany).toHaveBeenCalledOnce();
    expect(mocks.recordMany.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        model: "anthropic/claude-sonnet-5",
        usage: expect.objectContaining({ inputTokens: 2_000, outputTokens: 500 }),
      }),
      expect.objectContaining({
        model: "anthropic/claude-sonnet-4.6",
        usage: expect.objectContaining({ inputTokens: 1_000, outputTokens: 900 }),
      }),
    ]);
    expect(mocks.attachGenerationIds).toHaveBeenCalledWith(
      expect.objectContaining({ generationIds: ["gen-primary", "gen-fallback"] }),
    );
  });

  it("atomically aborts only a synchronous pre-dispatch failure", async () => {
    const failure = new Error("local request construction failed");
    const provider = vi.fn(() => {
      throw failure;
    });

    await expect(
      metered(
        { userId: "user-1", authorizationUsd: 0.1 },
        { role: "editor", operation: "editor.selection", model: "anthropic/claude-haiku-4.5" },
        provider,
      ),
    ).rejects.toBe(failure);

    expect(mocks.abort).toHaveBeenCalledWith(
      expect.objectContaining({
        intentRef: mocks.begin.mock.calls[0][0].intentRef,
        reservationRef: startedIntent().reservationRef,
      }),
    );
  });

  it("keeps an async network or stream interruption pending because provider billing is ambiguous", async () => {
    const failure = new Error("stream disconnected after dispatch");
    const provider = vi.fn(async () => {
      throw failure;
    });

    await expect(
      metered(
        {
          userId: "user-1",
          runId: "run-1",
          billingScope: "generation:run-1:chapter:1",
          reservationRef: "generation-reservation:run-1:wave-1",
        },
        { role: "writer", operation: "writer.draft", model: "anthropic/claude-sonnet-5" },
        provider,
      ),
    ).rejects.toBe(failure);

    expect(provider).toHaveBeenCalledOnce();
    expect(mocks.abort).not.toHaveBeenCalled();
    expect(mocks.recordMany).not.toHaveBeenCalled();
  });

  it("releases a first-step input guard failure that proves no provider dispatch", async () => {
    const failure = new MeteredInputLimitError("editor.selection", 10_000, 8_000, 0);

    await expect(
      metered(
        { userId: "user-1", authorizationUsd: 0.1 },
        { role: "editor", operation: "editor.selection", model: "anthropic/claude-haiku-4.5" },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);

    expect(mocks.abort).toHaveBeenCalledOnce();
  });

  it("keeps a later-step input guard failure held because earlier steps may be billed", async () => {
    const failure = new MeteredInputLimitError("writer.draft", 120_000, 112_000, 2);

    await expect(
      metered(
        {
          userId: "user-1",
          runId: "run-1",
          billingScope: "generation:run-1:chapter:1",
          reservationRef: "generation-reservation:run-1:wave-1",
        },
        { role: "writer", operation: "writer.draft", model: "anthropic/claude-sonnet-5" },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);

    expect(mocks.abort).not.toHaveBeenCalled();
  });

  it("keeps a successful provider attempt held when settlement fails and blocks a durable retry", async () => {
    const settlementFailure = new Error("database unavailable after provider success");
    mocks.recordMany.mockRejectedValueOnce(settlementFailure);
    const provider = vi.fn(async () => ({ usage }));
    const ctx = {
      userId: "user-1",
      runId: "run-1",
      billingScope: "generation:run-1:chapter:1",
      reservationRef: "generation-reservation:run-1:wave-1",
    };
    const info = {
      role: "writer",
      operation: "writer.draft",
      model: "anthropic/claude-sonnet-5",
    };

    await expect(metered(ctx, info, provider)).rejects.toBe(settlementFailure);
    expect(mocks.abort).not.toHaveBeenCalled();

    mocks.begin.mockResolvedValueOnce({
      ...startedIntent(),
      status: "pending",
    });
    await expect(metered(ctx, info, provider)).rejects.toBeInstanceOf(
      MeteringReconciliationRequiredError,
    );
    expect(provider).toHaveBeenCalledOnce();
  });

  it("refunds an undelivered settled action and permits exactly one compensated redo", async () => {
    mocks.begin
      .mockResolvedValueOnce({
        ...startedIntent(),
        status: "settled",
      })
      .mockResolvedValueOnce(startedIntent());
    const provider = vi.fn(async () => ({ usage }));

    await expect(
      metered(
        {
          userId: "user-1",
          runId: "run-1",
          billingScope: "generation:run-1:chapter:1",
          reservationRef: "generation-reservation:run-1:wave-1",
        },
        { role: "writer", operation: "writer.draft", model: "anthropic/claude-sonnet-5" },
        provider,
      ),
    ).resolves.toEqual({ usage });
    expect(mocks.refundSettled).toHaveBeenCalledOnce();
    expect(provider).toHaveBeenCalledOnce();
  });

  it("uses a caller-stable interactive key to block replay but permits a new action key", async () => {
    const seenPrefixes = new Set<string>();
    mocks.begin.mockImplementation(async (input) => {
      if (seenPrefixes.has(input.intentPrefix)) {
        return { ...startedIntent(), status: "pending" as const };
      }
      seenPrefixes.add(input.intentPrefix);
      return startedIntent();
    });
    const provider = vi.fn(async () => ({ usage }));
    const info = {
      role: "editor",
      operation: "editor.selection",
      model: "anthropic/claude-haiku-4.5",
    };

    await metered(
      { userId: "user-1", authorizationUsd: 0.1, idempotencyKey: "chapter:1:action-a" },
      info,
      provider,
    );
    await expect(
      metered(
        { userId: "user-1", authorizationUsd: 0.1, idempotencyKey: "chapter:1:action-a" },
        info,
        provider,
      ),
    ).rejects.toBeInstanceOf(MeteringReconciliationRequiredError);
    await metered(
      { userId: "user-1", authorizationUsd: 0.1, idempotencyKey: "chapter:1:action-b" },
      info,
      provider,
    );

    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("refunds the exact settled debit with a stable delivery reference", async () => {
    mocks.grant.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const ctx = {
      userId: "user-1",
      lastSettlement: {
        meteredUsd: 0.073421,
        credits: 0.20190775,
        externalRefPrefix: "llm:interactive:attempt:cover.generate",
      },
    };

    await expect(refundMeteredDelivery(ctx, "Cover delivery failed")).resolves.toBe(true);
    await expect(refundMeteredDelivery(ctx, "Cover delivery failed")).resolves.toBe(false);

    expect(mocks.grant).toHaveBeenCalledTimes(2);
    expect(mocks.grant).toHaveBeenNthCalledWith(1, {
      userId: "user-1",
      credits: 0.20190775,
      description: "Cover delivery failed",
      externalRef: "delivery-refund:llm:interactive:attempt:cover.generate",
      kind: "adjustment",
    });
  });

  it("refunds every settled call in a multi-call delivery exactly once", async () => {
    const ctx = {
      userId: "user-1",
      settlements: [
        {
          meteredUsd: 0.01,
          credits: 0.0275,
          externalRefPrefix: "llm:interactive:prompt:tool.image.prompt",
        },
        {
          meteredUsd: 0.067,
          credits: 0.18425,
          externalRefPrefix: "llm:interactive:image:tool.image.generate",
        },
      ],
    };

    await expect(refundMeteredDeliveries(ctx, "Illustration delivery failed")).resolves.toBe(2);

    expect(mocks.grant).toHaveBeenCalledTimes(2);
    expect(mocks.grant).toHaveBeenCalledWith(
      expect.objectContaining({
        credits: 0.0275,
        externalRef: "delivery-refund:llm:interactive:prompt:tool.image.prompt",
      }),
    );
    expect(mocks.grant).toHaveBeenCalledWith(
      expect.objectContaining({
        credits: 0.18425,
        externalRef: "delivery-refund:llm:interactive:image:tool.image.generate",
      }),
    );
  });

  it("refunds the exact persisted per-step debit instead of recomputing aggregate rounding", async () => {
    mocks.recordMany.mockResolvedValueOnce({
      meteredUsd: 0.00004,
      // Two 0.000055-credit step debits persist as 0.0001 each.
      debitedCredits: 0.0002,
    });
    const ctx = {
      userId: "user-1",
      authorizationUsd: 0.01,
      settlements: [] as NonNullable<import("./metering").MeterCtx["settlements"]>,
    };

    await metered(
      ctx,
      {
        role: "editor",
        operation: "editor.selection",
        model: "anthropic/claude-haiku-4.5",
      },
      async () => ({ usage }),
    );
    await refundMeteredDeliveries(ctx, "Undeliverable output");

    expect(mocks.grant).toHaveBeenCalledWith(
      expect.objectContaining({
        credits: 0.0002,
      }),
    );
  });
});

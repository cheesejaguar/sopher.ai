import { inspect } from "node:util";
import { NoObjectGeneratedError, NoOutputGeneratedError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  recordMany: vi.fn(),
  attachGenerationIds: vi.fn(),
  abort: vi.fn(),
  refundSettled: vi.fn(),
  grant: vi.fn(),
  cancellationCheck: vi.fn(),
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

vi.mock("@/lib/authoring-cancellation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authoring-cancellation")>();
  return {
    ...actual,
    throwIfAuthoringCancellationRequested: mocks.cancellationCheck,
  };
});

import { InsufficientCreditsError } from "@/lib/billing/credits";
import { AuthoringCancellationRequestedError } from "@/lib/authoring-cancellation";
import { ProjectSpendAccessError } from "@/lib/project-spend-access";
import { MeteredInputLimitError } from "./metering-limits";
import {
  gatewayOptions,
  MeteredDeliveryPendingError,
  MeteredDeliveryReplayError,
  MeteredOutputDeliveryError,
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
  mocks.cancellationCheck.mockResolvedValue(undefined);
});

describe("metered atomic authorization", () => {
  it("disables implicit Anthropic thinking without dropping Gateway attribution or fallbacks", () => {
    expect(
      gatewayOptions(
        {
          userId: "user-1",
          projectId: "project-1",
          meteringAttemptId: "attempt-1",
        },
        "writer",
        { withFallbacks: true },
      ),
    ).toEqual({
      gateway: {
        user: "user-1",
        tags: ["role:writer", "project:project-1", "attempt:attempt-1"],
        caching: "auto",
        models: expect.any(Array),
      },
      anthropic: {
        thinking: { type: "disabled" },
      },
    });
  });

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

  it("treats an author cancellation as the run state, never a credit failure", async () => {
    mocks.begin.mockResolvedValueOnce({
      ...startedIntent(),
      status: "cancelled",
    });
    const provider = vi.fn(async () => ({ usage }));

    await expect(
      metered(
        {
          userId: "user-1",
          projectId: "project-1",
          runId: "run-1",
          billingScope: "generation:run-1:chapter:1",
          reservationRef: "generation-reservation:run-1:wave-1",
        },
        { role: "writer", operation: "writer.draft", model: "anthropic/claude-sonnet-5" },
        provider,
      ),
    ).rejects.toBeInstanceOf(AuthoringCancellationRequestedError);
    expect(provider).not.toHaveBeenCalled();
    expect(mocks.abort).not.toHaveBeenCalled();
  });

  it("never presents a purchase as the remedy for an exhausted included allowance", async () => {
    mocks.begin.mockResolvedValueOnce({
      ...startedIntent(),
      status: "trial_cap",
    });
    const provider = vi.fn(async () => ({ usage }));

    const call = metered(
      { userId: "user-1", projectId: "project-1", authorizationUsd: 0.1 },
      { role: "editor", operation: "editor.selection", model: "anthropic/claude-haiku-4.5" },
      provider,
    );
    await expect(call).rejects.toMatchObject({
      name: "ProjectSpendAccessError",
      code: "included_allowance_exhausted",
      message: expect.not.stringMatching(/purchase|buy|upgrade/i),
    });
    await expect(call).rejects.toBeInstanceOf(ProjectSpendAccessError);
    expect(provider).not.toHaveBeenCalled();
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

  it("never creates an intent or dispatches after an existing cancellation request", async () => {
    const cancellation = new Error("Authoring cancellation requested");
    mocks.cancellationCheck.mockRejectedValueOnce(cancellation);
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
    ).rejects.toBe(cancellation);

    expect(mocks.begin).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    expect(mocks.abort).not.toHaveBeenCalled();
    expect(mocks.recordMany).not.toHaveBeenCalled();
  });

  it("settles an in-flight provider call before cancellation prevents its output delivery", async () => {
    const cancellation = new Error("Authoring cancellation requested");
    mocks.cancellationCheck
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(cancellation);
    const provider = vi.fn(async () => ({ usage }));
    const ctx = {
      userId: "user-1",
      runId: "run-1",
      billingScope: "generation:run-1:chapter:1",
      reservationRef: "generation-reservation:run-1:wave-1",
    };

    await expect(
      metered(
        ctx,
        { role: "writer", operation: "writer.draft", model: "anthropic/claude-sonnet-5" },
        provider,
      ),
    ).rejects.toBe(cancellation);

    expect(provider).toHaveBeenCalledOnce();
    expect(mocks.recordMany).toHaveBeenCalledOnce();
    expect(mocks.abort).not.toHaveBeenCalled();
    expect(ctx).toMatchObject({
      lastSettlement: {
        meteredUsd: 0.01,
        credits: 0.0275,
      },
    });
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

  it("settles and compensates a rejected structured response without repeating it", async () => {
    const malformed = new NoObjectGeneratedError({
      message: "No object generated: response did not match schema.",
      text: '{"entities":[]}',
      response: {
        id: "gateway-response-1",
        timestamp: new Date("2026-08-03T00:00:00.000Z"),
        modelId: "anthropic/claude-sonnet-5",
      },
      usage,
      finishReason: "stop",
    });
    const provider = vi
      .fn<() => Promise<{ usage: typeof usage }>>()
      .mockRejectedValueOnce(malformed)
      .mockResolvedValueOnce({ usage });
    const ctx = {
      userId: "user-1",
      runId: "run-1",
      billingScope: "generation:run-1:entity-bible",
      reservationRef: "generation-reservation:run-1:entity-bible",
    };
    const info = {
      role: "entity-bible",
      operation: "entity.bible",
      model: "anthropic/claude-sonnet-5",
    };

    await expect(metered(ctx, info, provider)).rejects.toMatchObject({
      name: "MeteredOutputDeliveryError",
      operation: "entity.bible",
      finishReason: "stop",
      // Nothing pins temperature, so a fresh sample can validate where this one
      // did not — and the callers most exposed to a validation miss produce the
      // manuscript rather than polish it, so they have no degrade path.
      isRetryable: true,
      rawText: '{"entities":[]}',
    });
    expect(mocks.recordMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          model: "anthropic/claude-sonnet-5",
          operation: "entity.bible",
          usage: expect.objectContaining({ inputTokens: 1_000, outputTokens: 500 }),
        }),
      ],
      expect.objectContaining({
        compensateDelivery: {
          description: "Provider output for entity.bible was incomplete and not delivered",
        },
      }),
    );
    expect(mocks.abort).not.toHaveBeenCalled();

    await expect(metered(ctx, info, provider)).resolves.toEqual({ usage });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(mocks.recordMany).toHaveBeenCalledTimes(2);
  });

  it("hands the paid text back for local repair without leaking it anywhere else", async () => {
    // Mirrors the 2026-08-04 continuity rejection: a plausible review that
    // misses caps Anthropic never forwarded to the model.
    const reviewSchema = z.object({
      score: z.number().min(0).max(1),
      issues: z
        .array(
          z.object({
            severity: z.enum(["minor", "major"]),
            chapters: z.array(z.number()).max(2),
          }),
        )
        .max(2),
      notes: z.record(z.string(), z.number()),
    });
    const rejected = {
      score: 85,
      issues: [
        { severity: "high", chapters: [1, 2, 3] },
        { severity: "major", chapters: [4] },
        { severity: "major", chapters: [5] },
      ],
      notes: { "Chapter 3: the lighthouse keeper wept": "unresolved" },
    };
    const parsed = reviewSchema.safeParse(rejected);
    const rawText = JSON.stringify(rejected);
    const malformed = new NoObjectGeneratedError({
      message: "No object generated: response did not match schema.",
      // The real chain is NoObjectGeneratedError -> TypeValidationError (which
      // carries the offending value) -> ZodError.
      cause: Object.assign(new Error("Type validation failed"), {
        name: "AI_TypeValidationError",
        value: rejected,
        cause: parsed.error,
      }),
      text: rawText,
      response: {
        id: "gateway-response-2",
        timestamp: new Date("2026-08-04T00:00:00.000Z"),
        modelId: "anthropic/claude-sonnet-5",
      },
      usage,
      finishReason: "stop",
    });

    const failure = await metered(
      {
        userId: "user-1",
        runId: "run-1",
        billingScope: "generation:run-1:continuity",
        reservationRef: "generation-reservation:run-1:continuity",
      },
      {
        role: "continuity",
        operation: "continuity.narrative_structure",
        model: "anthropic/claude-sonnet-5",
      },
      async () => {
        throw malformed;
      },
    ).then(
      () => null,
      (error: unknown) => error as MeteredOutputDeliveryError,
    );

    expect(failure).toBeInstanceOf(MeteredOutputDeliveryError);
    expect(failure?.isRetryable).toBe(true);
    // Paid output is salvageable in process, so a repair costs the author nothing.
    expect(failure?.rawText).toBe(rawText);
    // Structure only: every entry is a schema path plus a zod code. The
    // model-chosen record key is masked because it is author content.
    expect(failure?.validationIssues).toEqual([
      "score: too_big",
      "issues[].severity: invalid_value",
      "issues[].chapters: too_big",
      "issues: too_big",
      "notes.*: invalid_type",
    ]);
    for (const leak of ["lighthouse", "keeper wept", "high", "85"]) {
      expect(failure?.validationIssues.join(" ")).not.toContain(leak);
      expect(failure?.message).not.toContain(leak);
      // Own enumerable state is what logging, JSON, and structured clone see.
      expect(JSON.stringify({ ...failure })).not.toContain(leak);
      expect(inspect(failure, { depth: 6 })).not.toContain(leak);
    }
    expect(Object.keys(failure ?? {})).not.toContain("rawText");
  });

  it.each([
    // The provider answered and only local validation refused it, but a retry
    // is a fresh sample and the essential agents have no degrade path.
    ["stop", true],
    // Truncation repeats for an unchanged request and ceiling.
    ["length", false],
    ["content-filter", false],
    // Genuinely ambiguous outcomes may differ on a second attempt.
    ["tool-calls", true],
    ["error", true],
    ["other", true],
    ["unknown", true],
  ] as const)("retries a %s output delivery failure: %s", (finishReason, isRetryable) => {
    expect(
      new MeteredOutputDeliveryError("continuity.narrative_structure", finishReason, 3_742, 0)
        .isRetryable,
    ).toBe(isRetryable);
  });

  it("reports an unparseable response as a structure-only diagnostic", () => {
    const failure = new MeteredOutputDeliveryError("concept.refine", "stop", 500, 0, {
      rawText: "Here is the concept you asked for:\n```json\n{",
      validationCause: new NoObjectGeneratedError({
        message: "No object generated: could not parse the response.",
        cause: Object.assign(new Error("JSON parsing failed"), {
          name: "AI_JSONParseError",
          text: "Here is the concept you asked for:\n```json\n{",
          cause: new SyntaxError("Unexpected end of JSON input"),
        }),
        text: "Here is the concept you asked for:\n```json\n{",
        response: { id: "gateway-response-3", timestamp: new Date(0), modelId: "m" },
        usage,
        finishReason: "stop",
      }),
    });

    expect(failure.validationIssues).toEqual(["(root): invalid_json"]);
    expect(failure.message).not.toContain("concept you asked for");
  });

  it("bounds diagnostics so one rejected response cannot flood a failure record", () => {
    const wide = z.object(
      Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`field${index}`, z.number()])),
    );
    const parsed = wide.safeParse(
      Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`field${index}`, "no"])),
    );

    const failure = new MeteredOutputDeliveryError("editorial.gate", "stop", 400, 0, {
      validationCause: parsed.error,
    });

    expect(failure.validationIssues).toHaveLength(9);
    expect(failure.validationIssues.at(0)).toBe("field0: invalid_type");
    expect(failure.validationIssues.at(-1)).toBe("+2 more");
  });

  it("carries no diagnostics when a failure exposes no validation structure", () => {
    expect(
      new MeteredOutputDeliveryError("cover.generate", "error", 0, 0).validationIssues,
    ).toEqual([]);
    expect(
      new MeteredOutputDeliveryError("cover.generate", "error", 0, 0, {
        validationCause: new NoOutputGeneratedError(),
      }).validationIssues,
    ).toEqual([]);
    expect(new MeteredOutputDeliveryError("cover.generate", "error", 0, 0).rawText).toBeUndefined();
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

  it.each([
    ["delivery_pending", MeteredDeliveryPendingError],
    ["delivered", MeteredDeliveryReplayError],
  ] as const)(
    "never compensates or repeats an optional %s action",
    async (status, expectedError) => {
      mocks.begin.mockResolvedValueOnce({ ...startedIntent(), status });
      const provider = vi.fn(async () => ({ usage }));

      await expect(
        metered(
          {
            userId: "user-1",
            projectId: "project-1",
            idempotencyKey: "project:project-1:cover:request-1",
            deliveryReceiptRef: "optional-delivery:project-1:cover:request-1",
          },
          { role: "content-tool", operation: "cover.generate", model: "image-model" },
          provider,
        ),
      ).rejects.toBeInstanceOf(expectedError);

      expect(mocks.refundSettled).not.toHaveBeenCalled();
      expect(provider).not.toHaveBeenCalled();
    },
  );

  it("settles and refunds truncated structured output before exposing a non-retryable error", async () => {
    const truncatedUsage = {
      ...usage,
      outputTokens: 5_000,
      outputTokenDetails: { textTokens: 72, reasoningTokens: 4_928 },
    };
    const partialText = '{"logline":"the lighthouse keeper waits for';
    const provider = vi.fn(async () => ({
      usage: truncatedUsage,
      finishReason: "length",
      rawFinishReason: "max_tokens",
      text: partialText,
      get output(): never {
        throw new NoOutputGeneratedError();
      },
    }));

    const call = metered(
      {
        userId: "user-1",
        projectId: "project-1",
        runId: "run-1",
        billingScope: "generation:run-1:chapter:1",
        reservationRef: "generation-reservation:run-1:opening",
      },
      {
        role: "concept",
        operation: "concept.refine",
        model: "anthropic/claude-sonnet-5",
      },
      provider,
    );

    await expect(call).rejects.toMatchObject({
      name: "MeteredOutputDeliveryError",
      operation: "concept.refine",
      finishReason: "length",
      outputTokens: 5_000,
      reasoningTokens: 4_928,
      isRetryable: false,
      message: expect.stringContaining("finish reason: length"),
      // Truncated JSON is still paid-for output a caller may be able to close.
      rawText: partialText,
    });
    await expect(call).rejects.toBeInstanceOf(MeteredOutputDeliveryError);
    await expect(call).rejects.toMatchObject({
      message: expect.not.stringContaining("lighthouse"),
    });
    expect(mocks.recordMany).toHaveBeenCalledOnce();
    expect(mocks.recordMany).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        compensateDelivery: {
          description: "Provider output for concept.refine was incomplete and not delivered",
        },
      }),
    );
    expect(mocks.refundSettled).not.toHaveBeenCalled();
  });

  it("returns complete structured output without requesting delivery compensation", async () => {
    const output = { title: "Delivered" };
    const result = {
      usage,
      finishReason: "stop",
      get output() {
        return output;
      },
    };

    await expect(
      metered(
        { userId: "user-1", projectId: "project-1", authorizationUsd: 0.1 },
        {
          role: "concept",
          operation: "concept.refine",
          model: "anthropic/claude-sonnet-5",
        },
        async () => result,
      ),
    ).resolves.toBe(result);
    expect(mocks.recordMany).toHaveBeenCalledWith(
      expect.any(Array),
      expect.not.objectContaining({ compensateDelivery: expect.anything() }),
    );
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

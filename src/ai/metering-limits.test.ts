import { describe, expect, it, vi } from "vitest";

import { calculateUsd } from "@/lib/billing/pricing";
import { CREDIT_MARKUP, creditsForUsd } from "@/lib/billing/credits-shared";
import {
  assertMeteredInputWithinBudget,
  MeteredInputLimitError,
  meteredMaxOutputTokens,
  meteredOperationBudget,
  meteredOperationCeilingCredits,
  meteredOperationCeilingUsd,
} from "./metering-limits";

function ceil4(value: number): number {
  return Math.ceil(value * 10_000 - 1e-9) / 10_000;
}

describe("metered operation limits", () => {
  it("prices every possible writer tool-loop step at the costliest allowed fallback", () => {
    const budget = meteredOperationBudget("writer.draft");
    const outputTokens = 5_400;
    const fallbackPerStep = calculateUsd("anthropic/claude-sonnet-4.6", {
      inputTokens: budget.maxInputTokensPerStep,
      cacheWriteTokens: budget.maxInputTokensPerStep,
      outputTokens,
    });

    expect(budget.maxProviderSteps).toBe(3);
    const input = {
      model: "anthropic/claude-sonnet-5",
      operation: "writer.draft",
      maxOutputTokensPerStep: outputTokens,
    };
    const expectedCredits = ceil4(fallbackPerStep * CREDIT_MARKUP) * budget.maxProviderSteps;
    expect(meteredOperationCeilingCredits(input)).toBe(expectedCredits);
    expect(meteredOperationCeilingUsd(input)).toBe(expectedCredits / CREDIT_MARKUP);
  });

  it("includes per-step ledger quantization for an exact-max three-step writer result", () => {
    const budget = meteredOperationBudget("writer.draft");
    const outputTokens = 1_442;
    const fallbackPerStep = calculateUsd("anthropic/claude-sonnet-4.6", {
      inputTokens: budget.maxInputTokensPerStep,
      cacheWriteTokens: budget.maxInputTokensPerStep,
      outputTokens,
    });
    const perStepCredits = ceil4(fallbackPerStep * CREDIT_MARKUP);

    expect(
      meteredOperationCeilingCredits({
        model: "anthropic/claude-sonnet-5",
        operation: "writer.draft",
        maxOutputTokensPerStep: outputTokens,
      }),
    ).toBe(perStepCredits * 3);
  });

  it("keeps provider maxOutputTokens at or below the authorized operation cap", () => {
    expect(meteredMaxOutputTokens("writer.draft", 99_999)).toBe(
      meteredOperationBudget("writer.draft").maxOutputTokensPerStep,
    );
    expect(meteredMaxOutputTokens("writer.draft", 5_400)).toBe(5_400);
  });

  it("includes the generated image and its token envelope", () => {
    const budget = meteredOperationBudget("cover.generate");
    expect(budget.imageCount).toBe(1);
    const input = {
      model: "google/gemini-3.1-flash-image",
      operation: "cover.generate",
    };
    const expectedUsd = calculateUsd("google/gemini-3.1-flash-image", {
      inputTokens: budget.maxInputTokensPerStep,
      cacheWriteTokens: budget.maxInputTokensPerStep,
      outputTokens: budget.maxOutputTokensPerStep,
      imageCount: 1,
    });
    expect(meteredOperationCeilingCredits(input)).toBe(ceil4(expectedUsd * CREDIT_MARKUP));
    expect(meteredOperationCeilingUsd(input)).toBe(
      ceil4(expectedUsd * CREDIT_MARKUP) / CREDIT_MARKUP,
    );
  });

  it("accounts for every continuity provider step", () => {
    const budget = meteredOperationBudget("continuity.plot");
    const perStep = calculateUsd("anthropic/claude-sonnet-5", {
      inputTokens: budget.maxInputTokensPerStep,
      cacheWriteTokens: budget.maxInputTokensPerStep,
      outputTokens: budget.maxOutputTokensPerStep,
    });
    expect(budget.maxProviderSteps).toBe(5);
    const input = {
      model: "anthropic/claude-sonnet-5",
      operation: "continuity.plot",
    };
    const expectedCredits = ceil4(perStep * CREDIT_MARKUP) * 5;
    expect(meteredOperationCeilingCredits(input)).toBe(expectedCredits);
    expect(meteredOperationCeilingUsd(input)).toBe(expectedCredits / CREDIT_MARKUP);
  });

  it("prices a cold automatic cache write above ordinary Anthropic input", () => {
    const budget = meteredOperationBudget("editor.selection");
    const coldWrite = calculateUsd("anthropic/claude-haiku-4.5", {
      inputTokens: budget.maxInputTokensPerStep,
      cacheWriteTokens: budget.maxInputTokensPerStep,
      outputTokens: budget.maxOutputTokensPerStep,
    });
    expect(
      meteredOperationCeilingUsd({
        model: "anthropic/claude-haiku-4.5",
        operation: "editor.selection",
      }),
    ).toBe(coldWrite);
  });

  it("preserves the exact sum of two quantized illustration child claims", () => {
    const prompt = {
      model: "anthropic/claude-haiku-4.5",
      operation: "tool.image.prompt",
    };
    const image = {
      model: "google/gemini-3.1-flash-image",
      operation: "tool.image.generate",
    };
    const parentUsd = meteredOperationCeilingUsd(prompt) + meteredOperationCeilingUsd(image);

    expect(creditsForUsd(parentUsd)).toBeCloseTo(
      meteredOperationCeilingCredits(prompt) + meteredOperationCeilingCredits(image),
      10,
    );
  });

  it("rejects an oversized dynamic prompt before a guarded provider dispatch", () => {
    const provider = vi.fn();
    const dispatch = () => {
      assertMeteredInputWithinBudget(
        "editor.selection",
        { messages: [{ role: "user", content: "x".repeat(30_000) }] },
        0,
      );
      provider();
    };

    expect(dispatch).toThrow(MeteredInputLimitError);
    expect(provider).not.toHaveBeenCalled();
  });
});

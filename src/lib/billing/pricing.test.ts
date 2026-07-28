import { describe, expect, it } from "vitest";
import { calculateUsd, MODEL_PRICING } from "./pricing";

describe("calculateUsd", () => {
  it("charges token models on tokens only", () => {
    const usd = calculateUsd("anthropic/claude-sonnet-5", {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(usd).toBeCloseTo(MODEL_PRICING["anthropic/claude-sonnet-5"].inputPerMTok, 5);
  });

  it("prices cached-read input at the cheaper rate", () => {
    const p = MODEL_PRICING["anthropic/claude-sonnet-5"];
    const usd = calculateUsd("anthropic/claude-sonnet-5", {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(usd).toBeCloseTo(p.cachedInputPerMTok, 5);
  });

  it("bills image models per generated image, not just tokens", () => {
    const model = "google/gemini-3.1-flash-image";
    const perImage = MODEL_PRICING[model].perImageUsd!;
    // A single image with a small token footprint (~1,300 output tokens).
    const usd = calculateUsd(model, { inputTokens: 200, outputTokens: 1_300, imageCount: 1 });
    // The per-image charge must dominate — this is the budget-bypass regression.
    expect(usd).toBeGreaterThan(perImage);
    expect(usd - perImage).toBeLessThan(0.01);
    // Three images cost roughly triple.
    const three = calculateUsd(model, { inputTokens: 200, outputTokens: 1_300, imageCount: 3 });
    expect(three).toBeGreaterThan(3 * perImage);
  });

  it("defaults an unknown image model to the conservative fallback per-image price", () => {
    const usd = calculateUsd("unknown/some-image-model", {
      inputTokens: 0,
      outputTokens: 0,
      imageCount: 1,
    });
    expect(usd).toBeGreaterThan(0.1);
  });
});

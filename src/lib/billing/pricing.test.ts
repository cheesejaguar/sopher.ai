import { describe, expect, it } from "vitest";
import { calculateUsd, canonicalModelId, MODEL_PRICING } from "./pricing";

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

describe("canonicalModelId", () => {
  it.each([
    ["claude-sonnet-5-5", "anthropic/claude-sonnet-5.5"],
    ["claude-opus-5-5", "anthropic/claude-opus-5.5"],
    ["claude-sonnet-5", "anthropic/claude-sonnet-5"],
    ["claude-opus-5", "anthropic/claude-opus-5"],
    ["claude-haiku-4-5-20251001", "anthropic/claude-haiku-4.5"],
    ["anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-5.5"],
  ])("maps the Gateway's streamed id %s to %s", (reported, slug) => {
    expect(canonicalModelId(reported)).toBe(slug);
  });

  it("leaves ids it cannot price unchanged", () => {
    expect(canonicalModelId("claude-unknown-9-9")).toBe("claude-unknown-9-9");
    expect(canonicalModelId("google/gemini-3.1-flash-image")).toBe("google/gemini-3.1-flash-image");
  });

  it("prices a streamed id at its model's rates, not the unknown-model fallback", () => {
    const usage = { inputTokens: 10_000, outputTokens: 2_000, cacheWriteTokens: 8_000 };
    expect(calculateUsd("claude-sonnet-5-5", usage)).toBe(
      calculateUsd("anthropic/claude-sonnet-5.5", usage),
    );
  });
});

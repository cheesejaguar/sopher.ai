import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MODEL_PRICING } from "@/lib/billing/pricing";

import { anthropicReasoningOptions, MODELS, PROSE_FALLBACK_MODELS, QUALITY_TIERS } from "./models";

const everySlug = [
  ...new Set([
    ...QUALITY_TIERS.flatMap((tier) => Object.values(MODELS[tier])),
    ...PROSE_FALLBACK_MODELS,
  ]),
];

describe("model catalogue", () => {
  it("prices every model a tier or fallback chain can route to", () => {
    for (const slug of everySlug) expect(MODEL_PRICING[slug], slug).toBeDefined();
  });

  it("never routes prose to a fallback that costs more than any primary prose model", () => {
    const primaryOutput = Math.max(
      ...QUALITY_TIERS.map((tier) => MODEL_PRICING[MODELS[tier].prose].outputPerMTok),
    );
    for (const slug of PROSE_FALLBACK_MODELS) {
      expect(MODEL_PRICING[slug].outputPerMTok).toBeLessThanOrEqual(primaryOutput);
    }
  });
});

describe("models.ts source", () => {
  it("prices every gateway slug written anywhere in models.ts, including flag-gated ones", () => {
    const source = readFileSync(fileURLToPath(new URL("./models.ts", import.meta.url)), "utf8");
    const slugs = [
      ...new Set(
        [...source.matchAll(/"((?:anthropic|google|openai|xai)\/[\w.-]+)"/g)].map((m) => m[1]!),
      ),
    ];
    expect(slugs).toContain("anthropic/claude-haiku-5.5");
    const unpriced = slugs.filter((slug) => !(slug in MODEL_PRICING));
    expect(unpriced).toEqual([]);
  });
});

describe("anthropicReasoningOptions", () => {
  it("turns Haiku 5.5's adaptive thinking off, which would otherwise eat max_tokens", () => {
    expect(anthropicReasoningOptions("anthropic/claude-haiku-5.5")).toEqual({
      thinking: { type: "disabled" },
    });
  });

  it("uses between_tools for Sonnet 5.5 on its own", () => {
    expect(anthropicReasoningOptions("anthropic/claude-sonnet-5.5")).toEqual({
      thinking: { type: "between_tools" },
    });
  });

  it("bounds always-adaptive Opus 5.5 with low effort and no thinking setting", () => {
    expect(anthropicReasoningOptions("anthropic/claude-opus-5.5")).toEqual({ effort: "low" });
  });

  it("never sends effort to Haiku, which rejects it", () => {
    expect(anthropicReasoningOptions("anthropic/claude-haiku-4.5")).toEqual({
      thinking: { type: "disabled" },
    });
  });

  it("finds a setting every model in a fallback chain accepts", () => {
    expect(
      anthropicReasoningOptions("anthropic/claude-opus-5.5", ["anthropic/claude-sonnet-5"]),
    ).toEqual({ thinking: { type: "disabled" }, effort: "low" });
    expect(
      anthropicReasoningOptions("anthropic/claude-sonnet-5.5", ["anthropic/claude-sonnet-5"]),
    ).toEqual({ thinking: { type: "disabled" } });
  });

  it("keeps the conservative default for models it does not know", () => {
    expect(anthropicReasoningOptions("google/gemini-3.1-flash-image")).toEqual({
      thinking: { type: "disabled" },
    });
  });
});

import { describe, expect, it } from "vitest";

import { CREDIT_MARKUP, CREDIT_PACKS, creditsForUsd, getPack } from "./credits-shared";

/**
 * The pricing model is calibrated against two production books that measured
 * $6.39 and $8.61 to generate. These tests pin the arithmetic that decides
 * whether the business makes money, so a casual edit to the markup or the pack
 * table cannot quietly sell credits below cost.
 */

const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.3;
const TAX_PCT = 0.005;

/** Worst case: every credit in the pack is spent on metered work. */
function worstCaseMargin(usd: number, credits: number): number {
  const cogs = credits / CREDIT_MARKUP;
  const fees = usd * (STRIPE_PCT + TAX_PCT) + STRIPE_FIXED;
  return (usd - cogs - fees) / usd;
}

describe("credit packs", () => {
  it("every pack stays profitable even if every credit is spent", () => {
    for (const pack of CREDIT_PACKS) {
      expect(worstCaseMargin(pack.usd, pack.credits)).toBeGreaterThan(0.5);
    }
  });

  it("survives a 25% rise in underlying model prices", () => {
    for (const pack of CREDIT_PACKS) {
      const cogs = (pack.credits / CREDIT_MARKUP) * 1.25;
      const fees = pack.usd * (STRIPE_PCT + TAX_PCT) + STRIPE_FIXED;
      expect((pack.usd - cogs - fees) / pack.usd).toBeGreaterThan(0.35);
    }
  });

  it("credits are never fewer than dollars paid", () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.credits).toBeGreaterThanOrEqual(pack.usd);
    }
  });

  it("bonus rises with pack size, so upgrading is always better value", () => {
    const sorted = [...CREDIT_PACKS].sort((a, b) => a.usd - b.usd);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].bonus).toBeGreaterThanOrEqual(sorted[i - 1].bonus);
      const prevRate = sorted[i - 1].credits / sorted[i - 1].usd;
      expect(sorted[i].credits / sorted[i].usd).toBeGreaterThanOrEqual(prevRate);
    }
  });

  it("stated bonus matches the credits actually granted", () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.credits).toBe(Math.round(pack.usd * (1 + pack.bonus)));
    }
  });

  it("pack ids are unique and resolvable", () => {
    const ids = CREDIT_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getPack(id)).toBeDefined();
    expect(getPack("does-not-exist")).toBeUndefined();
  });
});

describe("creditsForUsd", () => {
  it("applies the markup", () => {
    expect(creditsForUsd(1)).toBeCloseTo(CREDIT_MARKUP, 10);
    expect(creditsForUsd(0)).toBe(0);
  });

  it("prices the measured books in line with the published guidance", () => {
    // Production: standard generated for $6.39, premium for $8.61.
    expect(Math.round(creditsForUsd(6.39))).toBe(18);
    expect(Math.round(creditsForUsd(8.61))).toBe(24);
    // Plus ~50% for light editing to a finished manuscript.
    expect(Math.round(creditsForUsd(6.39 * 1.5))).toBe(26);
  });

  it("keeps a real margin over metered cost", () => {
    const meteredUsd = 10;
    const retail = creditsForUsd(meteredUsd);
    expect((retail - meteredUsd) / retail).toBeGreaterThan(0.6);
  });
});

describe("welcome grant economics", () => {
  it("lets a new user watch a standard book begin", () => {
    // The pre-flight covers one wave (4 chapters), not the whole book. From
    // production data a 12-chapter standard book meters ~$6.39, so one wave
    // plus overhead is roughly a third of that.
    const oneWaveUsd = (6.39 / 12) * 4 * 1.4; // + overhead margin
    expect(creditsForUsd(oneWaveUsd)).toBeLessThan(10);
  });

  it("does not cover a whole standard book (the funnel pauses mid-book)", () => {
    expect(creditsForUsd(6.39)).toBeGreaterThan(10);
  });
});

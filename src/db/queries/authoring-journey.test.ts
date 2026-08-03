import { describe, expect, it } from "vitest";

import { classifyPersistedJourneyHealth } from "@/db/queries/authoring-journey";
import { classifyRunHealth, generationEstimate } from "@/lib/run-health";
import type { GenerationConfig } from "@/lib/run-events";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const ACCEPTED_AT = new Date("2026-07-31T11:30:00.000Z");
const CONFIG = {
  tier: "standard",
  targetChapters: 6,
  targetWordsPerChapter: 1_500,
} satisfies Partial<GenerationConfig>;

describe("database-only journey health parity", () => {
  it("uses the same twice-remaining-estimate critical boundary as open-project health", () => {
    const estimateMinutes = generationEstimate(CONFIG);
    expect(estimateMinutes).not.toBeNull();
    const progressPct = 50;
    const remainingEstimateMs = estimateMinutes! * 60_000 * (1 - progressPct / 100);
    const lastUpdateAt = new Date(NOW.getTime() - remainingEstimateMs * 2);

    expect(
      classifyRunHealth({
        databaseStatus: "running",
        workflowStatus: "running",
        acceptedAt: ACCEPTED_AT,
        lastUpdateAt,
        cancellationRequestedAt: null,
        remainingEstimateMs,
        now: NOW,
      }),
    ).toBe("critical");
    expect(
      classifyPersistedJourneyHealth({
        status: "running",
        workflowStatus: "running",
        stage: "chapters",
        acceptedAt: ACCEPTED_AT,
        lastUpdateAt,
        cancellationRequestedAt: null,
        config: CONFIG,
        progressPct,
        now: NOW,
      }),
    ).toBe("needs_attention");
  });

  it("maps the shared queued and degraded thresholds without changing their severity", () => {
    const queuedAt = new Date(NOW.getTime() - 10 * 60_000);
    expect(
      classifyRunHealth({
        databaseStatus: "queued",
        workflowStatus: "pending",
        acceptedAt: queuedAt,
        lastUpdateAt: queuedAt,
        cancellationRequestedAt: null,
        now: NOW,
      }),
    ).toBe("warning");
    expect(
      classifyPersistedJourneyHealth({
        status: "queued",
        workflowStatus: "pending",
        stage: "queued",
        acceptedAt: queuedAt,
        lastUpdateAt: queuedAt,
        cancellationRequestedAt: null,
        config: {},
        progressPct: 0,
        now: NOW,
      }),
    ).toBe("degraded");

    expect(
      classifyPersistedJourneyHealth({
        status: "running",
        workflowStatus: "unavailable",
        stage: "chapters",
        acceptedAt: NOW,
        lastUpdateAt: NOW,
        cancellationRequestedAt: null,
        config: {},
        progressPct: 25,
        now: NOW,
      }),
    ).toBe("degraded");
  });
});

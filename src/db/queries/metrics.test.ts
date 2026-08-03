import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getDb: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

import {
  getAuthoringOperationsMetrics,
  normalizeAuthoringOperationsMetrics,
} from "@/db/queries/metrics";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ userId: "admin-1" });
  mocks.getDb.mockReturnValue({ execute: mocks.execute });
});

describe("authoring operations metrics", () => {
  it("normalizes Neon numeric strings and derives denominator-safe rates", () => {
    const metrics = normalizeAuthoringOperationsMetrics({
      firstEventSample: "12",
      firstEventMedianSeconds: "4.5",
      firstEventP95Seconds: "19.25",
      actionWaitCount: "3",
      actionWaitMedianHours: "2.25",
      actionWaitOldestHours: "8",
      anomalyCount: "2",
      anomalyMedianHours: "4",
      anomalyOldestHours: "9.5",
      redispatchAttempts: "5",
      redispatchRecovered: "4",
      recoveryAttempts: "2",
      recoveryCompleted: "1",
      staleHoldCount: "1",
      staleHoldCredits: "3.75",
      staleHoldOldestHours: "26",
      completedTrials: "8",
      trialPurchasers: "2",
    });

    expect(metrics).toEqual({
      firstAuthoringEvent: {
        sample: 12,
        medianSeconds: 4.5,
        p95Seconds: 19.25,
      },
      actionWaits: { count: 3, medianHours: 2.25, oldestHours: 8 },
      anomalies: { count: 2, medianHours: 4, oldestHours: 9.5 },
      redispatch: { attempts: 5, recovered: 4, rate: 0.8 },
      recovery: { attempts: 2, completed: 1, rate: 0.5 },
      staleHolds: { count: 1, credits: 3.75, oldestHours: 26 },
      trialConversion: { completedTrials: 8, purchasers: 2, rate: 0.25 },
    });
  });

  it("returns truthful empty cohorts instead of fabricated zero-percent conversion", () => {
    const metrics = normalizeAuthoringOperationsMetrics(undefined);

    expect(metrics.redispatch.rate).toBeNull();
    expect(metrics.recovery.rate).toBeNull();
    expect(metrics.trialConversion.rate).toBeNull();
    expect(metrics.firstAuthoringEvent.medianSeconds).toBeNull();
    expect(metrics.staleHolds).toEqual({ count: 0, credits: 0, oldestHours: null });
  });

  it("requires admin access and reads all operational measures in one server query", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        {
          firstEventSample: 1,
          firstEventMedianSeconds: 5,
          firstEventP95Seconds: 5,
          actionWaitCount: 0,
          actionWaitMedianHours: null,
          actionWaitOldestHours: null,
          anomalyCount: 0,
          anomalyMedianHours: null,
          anomalyOldestHours: null,
          redispatchAttempts: 1,
          redispatchRecovered: 1,
          recoveryAttempts: 0,
          recoveryCompleted: 0,
          staleHoldCount: 0,
          staleHoldCredits: 0,
          staleHoldOldestHours: null,
          completedTrials: 1,
          trialPurchasers: 1,
        },
      ],
    });

    const metrics = await getAuthoringOperationsMetrics();

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(metrics.redispatch.rate).toBe(1);
    expect(metrics.trialConversion.rate).toBe(1);
  });

  it("counts actual retry attempts and requires durable authoring evidence for recovery", () => {
    const source = readFileSync(resolve(process.cwd(), "src/db/queries/metrics.ts"), "utf8");
    const start = source.indexOf("redispatch_runs as (");
    const end = source.indexOf("recovery_runs as (", start);
    const redispatch = source.slice(start, end);

    expect(redispatch).toContain("greatest(run.dispatch_attempts - 1, 0)::int as retry_attempts");
    expect(redispatch).toContain("run.status in ('running', 'awaiting_input', 'completed')");
    expect(redispatch).toContain("from meaningful_first_events event");
    expect(redispatch).not.toContain("workflow_run_id is not null");
    expect(source).toContain("coalesce(sum(retry_attempts), 0)::int");
  });
});

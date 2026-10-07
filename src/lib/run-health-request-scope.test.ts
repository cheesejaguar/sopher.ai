import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  select: vi.fn(),
}));

vi.mock("workflow/api", () => ({ getRun: mocks.getRun }));

/**
 * Every read resolves to no rows and every write records its SET payload.
 * The chain is thenable at each step so it serves all of getRunHealth's query
 * shapes without modelling them one by one.
 */
function chain(): unknown {
  const node: Record<string, unknown> = {};
  for (const method of [
    "from",
    "where",
    "orderBy",
    "limit",
    "innerJoin",
    "leftJoin",
    "groupBy",
    "returning",
  ]) {
    node[method] = () => node;
  }
  node.set = (values: unknown) => {
    mocks.set(values);
    return node;
  };
  node.then = (resolve: (rows: unknown[]) => unknown) => resolve([]);
  return node;
}

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return {
    ...actual,
    getDb: () => ({
      select: (...args: unknown[]) => {
        mocks.select(...args);
        return chain();
      },
      update: (...args: unknown[]) => {
        mocks.update(...args);
        return chain();
      },
    }),
  };
});

import {
  getRequestRunHealth,
  WORKFLOW_MISSING_OBSERVATION_MIN_INTERVAL_MS,
} from "@/lib/run-health";

const run = {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  userId: "author-1",
  workflowRunId: "wrun_missing",
  kind: "full_book",
  status: "running",
  config: {},
  error: null,
  startedAt: new Date("2026-10-06T12:00:00.000Z"),
  completedAt: null,
  acceptanceUncertainAt: null,
  acceptanceDispatchClaimedAt: null,
  healthCheckedAt: null,
  currentStage: "chapters" as const,
  progressPct: 40,
  stageDescription: null,
  lastProgressAt: null,
  heartbeatAt: null,
  workflowObservedStatus: null,
  workflowObservedAt: null,
  workflowMissingSince: null,
  workflowMissingCount: 0,
  dispatchAttempts: 1,
  cancellationRequestedAt: null,
  cancellationReason: null,
  pauseKind: null,
  pauseVersion: 0,
  pauseDetails: null,
  pauseRegisteredAt: null,
  supportReference: "33333333-3333-4333-8333-333333333333",
  rootErrorCode: null,
  rootErrorStage: null,
  createdAt: new Date("2026-10-06T11:59:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRun.mockReturnValue({ exists: Promise.resolve(false) });
});

describe("request-scoped run health", () => {
  it("probes Workflow and persists one observation when layout and page share a render", async () => {
    // Stands in for the per-render Map that React's cache() hands out; vitest
    // runs outside a React server render, where cache() does not memoize.
    const scope = new Map();

    // The layout and page render concurrently, so both calls are in flight
    // before either resolves. Separate row objects mirror the two callers.
    const [layoutHealth, pageHealth] = await Promise.all([
      getRequestRunHealth({ ...run }, scope),
      getRequestRunHealth({ ...run }, scope),
    ]);

    expect(pageHealth).toBe(layoutHealth);
    expect(layoutHealth.workflowStatus).toBe("missing");
    expect(mocks.getRun).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("probes again in a new render", async () => {
    await getRequestRunHealth(run, new Map());
    await getRequestRunHealth(run, new Map());

    expect(mocks.getRun).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it("counts at most one missing observation per window, decided in the UPDATE itself", async () => {
    await getRequestRunHealth(run, new Map());

    const values = mocks.set.mock.calls[0]?.[0] as Record<string, SQL>;
    const dialect = new PgDialect();
    const count = dialect.sqlToQuery(values.workflowMissingCount);
    const observedAt = dialect.sqlToQuery(values.workflowObservedAt);

    for (const query of [count, observedAt]) {
      expect(query.sql).toContain(`"workflow_observed_status" = 'missing'`);
      expect(query.sql).toContain(`"workflow_observed_at" >`);
    }
    // Inside the window the count and the counted timestamp are both kept, so
    // fast polling cannot hold the evidence window open without counting.
    expect(count.sql).toMatch(/then "generation_runs"\."workflow_missing_count"\s+else/);
    expect(observedAt.sql).toMatch(/then "generation_runs"\."workflow_observed_at"\s+else/);

    const [windowStart] = count.params as string[];
    const windowMs = Date.now() - new Date(windowStart).getTime();
    expect(windowMs).toBeGreaterThanOrEqual(WORKFLOW_MISSING_OBSERVATION_MIN_INTERVAL_MS);
    expect(windowMs).toBeLessThan(WORKFLOW_MISSING_OBSERVATION_MIN_INTERVAL_MS + 5_000);
  });
});

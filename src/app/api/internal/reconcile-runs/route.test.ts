import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
}));

vi.mock("@/lib/run-health", () => ({
  reconcileActiveAuthoringRuns: mocks.reconcile,
}));

import { GET } from "./route";

describe("run reconciliation watchdog", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "signed-watchdog-secret");
    mocks.reconcile.mockReset();
    mocks.reconcile.mockResolvedValue([]);
  });

  it("fails closed without the signed bearer token", async () => {
    const response = await GET(new Request("https://sopher.ai/api/internal/reconcile-runs"));
    expect(response.status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("reconciles active runs for an authorized Vercel Cron request", async () => {
    mocks.reconcile.mockResolvedValue([
      { runId: "run-1", outcome: "failed", workflowStatus: "failed" },
      { runId: "run-2", outcome: "unchanged", workflowStatus: "running" },
      {
        runId: "run-3",
        outcome: "error",
        workflowStatus: "unavailable",
        error: "database timeout",
      },
    ]);
    const response = await GET(
      new Request("https://sopher.ai/api/internal/reconcile-runs", {
        headers: { authorization: "Bearer signed-watchdog-secret" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      inspected: 3,
      failed: 1,
      unchanged: 1,
      errors: 1,
    });
    expect(mocks.reconcile).toHaveBeenCalledWith({ limit: 250 });
  });
});

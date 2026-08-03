import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  reconcileExports: vi.fn(),
}));

vi.mock("@/lib/run-health", () => ({
  reconcileActiveAuthoringRuns: mocks.reconcile,
}));

vi.mock("@/lib/export-dispatch", () => ({
  reconcileActiveExportRuns: mocks.reconcileExports,
}));

import { GET } from "./route";

describe("run reconciliation watchdog", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "signed-watchdog-secret");
    mocks.reconcile.mockReset();
    mocks.reconcileExports.mockReset();
    mocks.reconcile.mockResolvedValue([]);
    mocks.reconcileExports.mockResolvedValue([]);
  });

  it("fails closed without the signed bearer token", async () => {
    const response = await GET(new Request("https://sopher.ai/api/internal/reconcile-runs"));
    expect(response.status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.reconcileExports).not.toHaveBeenCalled();
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
    mocks.reconcileExports.mockResolvedValue([
      { runId: "export-1", outcome: "completed" },
      { runId: "export-2", outcome: "error" },
    ]);
    const response = await GET(
      new Request("https://sopher.ai/api/internal/reconcile-runs", {
        headers: { authorization: "Bearer signed-watchdog-secret" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      inspected: 5,
      completed: 1,
      failed: 1,
      unchanged: 1,
      errors: 2,
    });
    expect(mocks.reconcile).toHaveBeenCalledWith({ limit: 250 });
    expect(mocks.reconcileExports).toHaveBeenCalledWith({ limit: 250 });
  });
});

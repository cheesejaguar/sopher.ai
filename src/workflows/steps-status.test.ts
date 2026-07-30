import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transition: vi.fn(),
}));

vi.mock("@/lib/generation-runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation-runs")>();
  return { ...actual, transitionAuthoringRunState: mocks.transition };
});

import { markRunStatus } from "./steps";

const ref = { dbRunId: "run-1", projectId: "project-1", userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transition.mockImplementation(async (input: { status: string }) => ({
    status: input.status,
    transitioned: true,
  }));
});

describe("markRunStatus transition boundary", () => {
  it.each(["completed", "failed", "cancelled"] as const)(
    "routes %s through the project-and-wallet locked transition",
    async (status) => {
      await markRunStatus(ref, status, status === "failed" ? "generation failed" : undefined);

      expect(mocks.transition).toHaveBeenCalledWith({
        runId: "run-1",
        projectId: "project-1",
        userId: "user-1",
        status,
        error: status === "failed" ? "generation failed" : undefined,
      });
    },
  );

  it("stops a stale workflow step instead of resurrecting a cancelled run", async () => {
    mocks.transition.mockResolvedValue({ status: "cancelled", transitioned: false });

    await expect(markRunStatus(ref, "running")).rejects.toThrow(
      "Generation run is no longer active",
    );
  });

  it("treats replay of the same committed terminal transition as success", async () => {
    mocks.transition.mockResolvedValue({ status: "completed", transitioned: false });

    await expect(markRunStatus(ref, "completed")).resolves.toBeUndefined();
  });

  it("cannot downgrade a completed run when a later progress emit fails", async () => {
    mocks.transition.mockResolvedValue({ status: "completed", transitioned: false });

    await expect(markRunStatus(ref, "failed", "late event failure")).resolves.toBeUndefined();
  });
});

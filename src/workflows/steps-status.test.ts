import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transition: vi.fn(),
  withDbTransaction: vi.fn(),
  recordAuthoringIncident: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, withDbTransaction: mocks.withDbTransaction };
});

vi.mock("@/lib/generation-runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation-runs")>();
  return { ...actual, transitionAuthoringRunState: mocks.transition };
});

vi.mock("@/lib/authoring-incidents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authoring-incidents")>();
  return { ...actual, recordAuthoringIncident: mocks.recordAuthoringIncident };
});

import { markRunStatus, withActiveAuthoringMutation } from "./steps";

const ref = { dbRunId: "run-1", projectId: "project-1", userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordAuthoringIncident.mockResolvedValue(undefined);
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
        ...(status === "completed" ? { resolveCancellationOnComplete: true } : {}),
      });
    },
  );

  it("persists unresolved metering as structured root evidence and a critical incident", async () => {
    await markRunStatus(ref, "failed", "reconciliation is required", {
      errorCode: "metering_reconciliation_required",
      errorStage: "concept",
      incidentCategory: "unresolved_metering",
    });

    expect(mocks.transition).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      status: "failed",
      error: "reconciliation is required",
      errorCode: "metering_reconciliation_required",
      errorStage: "concept",
    });
    expect(mocks.recordAuthoringIncident).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
      category: "unresolved_metering",
      severity: "critical",
      dedupeKey: "unresolved-metering",
      evidence: {
        errorCode: "metering_reconciliation_required",
        stage: "concept",
      },
    });
  });

  it("keeps settled usage with a missing output checkpoint blocked as a completion contradiction", async () => {
    await markRunStatus(ref, "failed", "The settled output checkpoint is missing", {
      errorCode: "metered_output_missing",
      errorStage: "concept",
      incidentCategory: "completion_contradiction",
    });

    expect(mocks.recordAuthoringIncident).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
      category: "completion_contradiction",
      severity: "critical",
      dedupeKey: "settled-output-missing",
      evidence: { errorCode: "metered_output_missing", stage: "concept" },
    });
  });

  it("classifies a cancellation that wins before work starts as cancellation", async () => {
    mocks.transition.mockResolvedValue({ status: "cancelled", transitioned: false });

    await expect(markRunStatus(ref, "running")).rejects.toThrow("Authoring cancellation requested");
  });

  it("treats replay of the same committed terminal transition as success", async () => {
    mocks.transition.mockResolvedValue({ status: "completed", transitioned: false });

    await expect(markRunStatus(ref, "completed")).resolves.toEqual({
      outcome: "matched",
      status: "completed",
    });
  });

  it("cannot downgrade a completed run when a later progress emit fails", async () => {
    mocks.transition.mockResolvedValue({ status: "completed", transitioned: false });

    await expect(markRunStatus(ref, "failed", "late event failure")).resolves.toEqual({
      outcome: "terminal_preserved",
      status: "completed",
    });
  });

  it("resolves a cancellation that wins after scoped output commits as the terminal outcome", async () => {
    mocks.transition.mockResolvedValue({ status: "cancelled", transitioned: true });

    await expect(markRunStatus(ref, "completed")).resolves.toEqual({
      outcome: "cancellation_won",
      status: "cancelled",
    });
    expect(mocks.transition).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      status: "completed",
      error: undefined,
      resolveCancellationOnComplete: true,
    });
  });
});

describe("active authoring mutation boundary", () => {
  function transactionFor(run: { status: string; cancellationRequestedAt: Date | null }) {
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([run]),
          }),
        }),
      }),
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );
    return tx;
  }

  it("holds the project cancellation lock through a manuscript mutation", async () => {
    const tx = transactionFor({ status: "running", cancellationRequestedAt: null });
    const mutate = vi.fn().mockResolvedValue("committed");

    await expect(withActiveAuthoringMutation(ref, mutate)).resolves.toBe("committed");
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledWith(tx);
  });

  it("rejects the mutation after cancellation wins the shared lock", async () => {
    transactionFor({
      status: "running",
      cancellationRequestedAt: new Date("2026-07-30T12:00:00.000Z"),
    });
    const mutate = vi.fn();

    await expect(withActiveAuthoringMutation(ref, mutate)).rejects.toThrow(
      "Authoring cancellation requested",
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it("preserves an unrelated terminal state as inactive rather than cancellation", async () => {
    transactionFor({ status: "failed", cancellationRequestedAt: null });
    const mutate = vi.fn();

    await expect(withActiveAuthoringMutation(ref, mutate)).rejects.toThrow(
      "Generation run is no longer active",
    );
    expect(mutate).not.toHaveBeenCalled();
  });
});

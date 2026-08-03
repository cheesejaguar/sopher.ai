import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withDbTransaction: vi.fn(),
  deleteClerkUserTransaction: vi.fn(),
  reconcileCreditReservations: vi.fn(),
  requestRunCancellations: vi.fn(),
  sleep: vi.fn(),
}));

vi.mock("@/db", () => ({
  withDbTransaction: mocks.withDbTransaction,
}));
vi.mock("@/lib/account-deletion-transaction", () => ({
  deleteClerkUserTransaction: mocks.deleteClerkUserTransaction,
}));
vi.mock("@/lib/billing/credits", () => ({
  reconcileCreditReservations: mocks.reconcileCreditReservations,
}));
vi.mock("@/lib/clerk-deletion-finalizer", () => ({
  requestDeletedClerkUserRunCancellations: mocks.requestRunCancellations,
}));
vi.mock("workflow", () => ({
  sleep: mocks.sleep,
}));

import {
  finalizeDeletedClerkUser,
  finalizeDeletedClerkUserStep,
} from "@/workflows/finalize-clerk-user-deletion";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestRunCancellations.mockResolvedValue(1);
  mocks.reconcileCreditReservations.mockResolvedValue(0);
  mocks.withDbTransaction.mockImplementation(
    async (callback: (transaction: { id: string }) => Promise<unknown>) =>
      callback({ id: "transaction" }),
  );
  mocks.deleteClerkUserTransaction.mockResolvedValue("deleted");
  mocks.sleep.mockResolvedValue(undefined);
});

describe("deleted Clerk user finalization", () => {
  it("blocks active authoring before attempting the destructive transaction", async () => {
    await expect(finalizeDeletedClerkUserStep("user-1")).resolves.toBe("deleted");

    expect(mocks.requestRunCancellations).toHaveBeenCalledWith("user-1");
    expect(mocks.reconcileCreditReservations).toHaveBeenCalledWith("user-1");
    expect(mocks.deleteClerkUserTransaction).toHaveBeenCalledWith(
      { id: "transaction" },
      expect.objectContaining({ userId: "user-1" }),
    );
    expect(mocks.requestRunCancellations.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteClerkUserTransaction.mock.invocationCallOrder[0],
    );
  });

  it("does not enter the deletion transaction when cancellation marking fails", async () => {
    mocks.requestRunCancellations.mockRejectedValue(new Error("database unavailable"));

    await expect(finalizeDeletedClerkUserStep("user-1")).rejects.toThrow("database unavailable");
    expect(mocks.withDbTransaction).not.toHaveBeenCalled();
  });

  it("retries unresolved work without duplicating a successful deletion", async () => {
    mocks.deleteClerkUserTransaction
      .mockResolvedValueOnce("active_run")
      .mockResolvedValueOnce("deleted");

    await expect(finalizeDeletedClerkUser("user-1")).resolves.toBeUndefined();

    expect(mocks.requestRunCancellations).toHaveBeenCalledTimes(2);
    expect(mocks.deleteClerkUserTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.sleep).toHaveBeenCalledOnce();
    expect(mocks.sleep).toHaveBeenCalledWith("1 minute");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return {
    ...actual,
    getDb: mocks.getDb,
  };
});

import {
  AUTHORING_CANCELLATION_MESSAGE,
  AUTHORING_RUN_INACTIVE_MESSAGE,
  AuthoringCancellationRequestedError,
  AuthoringRunInactiveError,
  throwIfAuthoringCancellationRequested,
} from "@/lib/authoring-cancellation";

function runQuery(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return {
    db: { select: vi.fn().mockReturnValue({ from }) },
    limit,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("throwIfAuthoringCancellationRequested", () => {
  it("does not read the database for an unmetered operation without a run", async () => {
    await expect(throwIfAuthoringCancellationRequested(null)).resolves.toBeUndefined();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("allows an active run with no cancellation request", async () => {
    mocks.getDb.mockReturnValue(
      runQuery([{ status: "running", cancellationRequestedAt: null }]).db,
    );

    await expect(throwIfAuthoringCancellationRequested("run-1")).resolves.toBeUndefined();
  });

  it.each([
    {
      status: "running",
      cancellationRequestedAt: new Date("2026-07-30T12:00:00.000Z"),
    },
    { status: "cancelled", cancellationRequestedAt: null },
  ])("blocks output mutation for $status", async (row) => {
    mocks.getDb.mockReturnValue(runQuery([row]).db);

    const rejection = throwIfAuthoringCancellationRequested("run-1");
    await expect(rejection).rejects.toBeInstanceOf(AuthoringCancellationRequestedError);
    await expect(rejection).rejects.toMatchObject({
      name: "AuthoringCancellationRequestedError",
      message: AUTHORING_CANCELLATION_MESSAGE,
      isRetryable: false,
    });
  });

  it.each([
    { status: "failed", cancellationRequestedAt: null },
    { status: "completed", cancellationRequestedAt: null },
  ])("preserves an already terminal $status run as inactive, not cancelled", async (row) => {
    mocks.getDb.mockReturnValue(runQuery([row]).db);

    const rejection = throwIfAuthoringCancellationRequested("run-1");
    await expect(rejection).rejects.toBeInstanceOf(AuthoringRunInactiveError);
    await expect(rejection).rejects.toMatchObject({
      name: "AuthoringRunInactiveError",
      message: AUTHORING_RUN_INACTIVE_MESSAGE,
      isRetryable: false,
    });
  });

  it("fails closed when the referenced run no longer exists", async () => {
    mocks.getDb.mockReturnValue(runQuery([]).db);
    await expect(throwIfAuthoringCancellationRequested("run-missing")).rejects.toBeInstanceOf(
      AuthoringRunInactiveError,
    );
  });
});

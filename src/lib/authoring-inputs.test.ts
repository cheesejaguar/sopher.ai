import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  withDbTransaction: vi.fn(),
  resumeHook: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return {
    ...actual,
    getDb: mocks.getDb,
    withDbTransaction: mocks.withDbTransaction,
  };
});

vi.mock("workflow/api", () => ({
  resumeHook: mocks.resumeHook,
}));

import {
  acceptAuthoringRunInput,
  allocateAuthoringPause,
  authoringInputPayloadsEqual,
  authoringInputToken,
  consumeAuthoringRunInput,
  redeliverAcceptedAuthoringRunInput,
} from "@/lib/authoring-inputs";
import { AuthoringCancellationRequestedError } from "@/lib/authoring-cancellation";

function selectLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function joinedSelectLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

function updateQuery() {
  const where = vi.fn().mockResolvedValue([]);
  const set = vi.fn().mockReturnValue({ where });
  return { update: vi.fn().mockReturnValue({ set }), set, where };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resumeHook.mockResolvedValue(undefined);
});

describe("durable authoring input identity", () => {
  it("binds Workflow hooks to the run, input kind, and pause version", () => {
    expect(
      authoringInputToken({
        runId: "run-1",
        kind: "outline_approval",
        pauseVersion: 3,
      }),
    ).toBe("authoring-input:run-1:outline_approval:3");
  });

  it("treats reordered jsonb objects as the same answer without weakening array order", () => {
    expect(
      authoringInputPayloadsEqual(
        {
          decision: "approved",
          metadata: { revision: 2, options: { tone: "warm", pace: "fast" } },
        },
        {
          metadata: { options: { pace: "fast", tone: "warm" }, revision: 2 },
          decision: "approved",
        },
      ),
    ).toBe(true);
    expect(authoringInputPayloadsEqual({ chapters: [1, 2] }, { chapters: [2, 1] })).toBe(false);
  });

  it("returns an already accepted answer after response loss even when jsonb key order changed", async () => {
    const acceptedAt = new Date("2026-07-30T12:00:00.000Z");
    const stored = {
      id: "input-1",
      runId: "run-1",
      kind: "outline_approval" as const,
      pauseVersion: 2,
      requestKey: "request-original",
      payload: {
        metadata: { revision: 2, source: "outline" },
        decision: "approved",
      },
      status: "accepted" as const,
      deliveryAttempts: 0,
      acceptedAt,
      deliveredAt: null,
      consumedAt: null,
      lastDeliveryError: null,
    };
    const select = vi
      .fn()
      .mockReturnValueOnce(
        selectLimit([
          {
            kind: "outline_approval",
            version: 2,
            registeredAt: acceptedAt,
            status: "awaiting_input",
            cancellationRequestedAt: null,
          },
        ]),
      )
      .mockReturnValueOnce(selectLimit([stored]));
    const returning = vi.fn().mockResolvedValue([]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select,
      insert: vi.fn().mockReturnValue({ values }),
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    const result = await acceptAuthoringRunInput({
      runId: "run-1",
      userId: "user-1",
      kind: "outline_approval",
      pauseVersion: 2,
      requestKey: "request-retry",
      payload: {
        decision: "approved",
        metadata: { source: "outline", revision: 2 },
      },
    });

    expect(result).toEqual({
      input: {
        id: "input-1",
        kind: "outline_approval",
        pauseVersion: 2,
        payload: stored.payload,
        status: "accepted",
      },
      replayed: true,
    });
  });

  it("rejects a response-loss retry that attempts to change an accepted answer", async () => {
    const acceptedAt = new Date("2026-07-30T12:00:00.000Z");
    const select = vi
      .fn()
      .mockReturnValueOnce(
        selectLimit([
          {
            kind: "outline_approval",
            version: 2,
            registeredAt: acceptedAt,
            status: "awaiting_input",
            cancellationRequestedAt: null,
          },
        ]),
      )
      .mockReturnValueOnce(
        selectLimit([
          {
            id: "input-1",
            kind: "outline_approval",
            pauseVersion: 2,
            payload: { decision: "approved" },
            status: "accepted",
          },
        ]),
      );
    const returning = vi.fn().mockResolvedValue([]);
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select,
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
        }),
      }),
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await expect(
      acceptAuthoringRunInput({
        runId: "run-1",
        userId: "user-1",
        kind: "outline_approval",
        pauseVersion: 2,
        payload: { decision: "revise" },
      }),
    ).rejects.toThrow("already answered differently");
  });

  it("locks against cancellation and rejects a stale waiting-input snapshot", async () => {
    const insert = vi.fn();
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select: vi.fn().mockReturnValue(
        selectLimit([
          {
            kind: "outline_approval",
            version: 2,
            registeredAt: new Date("2026-07-30T12:00:00.000Z"),
            status: "awaiting_input",
            cancellationRequestedAt: new Date("2026-07-30T12:00:01.000Z"),
          },
        ]),
      ),
      insert,
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await expect(
      acceptAuthoringRunInput({
        runId: "run-1",
        userId: "user-1",
        kind: "outline_approval",
        pauseVersion: 2,
        payload: { decision: "approved" },
      }),
    ).rejects.toThrow("Run is not waiting for this input");
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("durable pause allocation", () => {
  it("takes the project lock and preserves cancellation as the initiating result", async () => {
    const update = vi.fn();
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select: vi.fn().mockReturnValue(
        selectLimit([
          {
            status: "running",
            kind: null,
            version: 0,
            key: null,
            registeredAt: null,
            details: null,
            cancellationRequestedAt: new Date("2026-07-30T12:00:00.000Z"),
          },
        ]),
      ),
      update,
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await expect(
      allocateAuthoringPause({
        runId: "run-1",
        projectId: "project-1",
        userId: "user-1",
        kind: "outline_approval",
        pauseKey: "workflow-step:outline-pause",
      }),
    ).rejects.toBeInstanceOf(AuthoringCancellationRequestedError);
    expect(tx.execute).toHaveBeenCalledTimes(2);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("durable authoring input redelivery", () => {
  it("redelivers an accepted input only after the grace period and against the current pause", async () => {
    const row = {
      id: "input-1",
      runId: "run-1",
      kind: "outline_approval" as const,
      pauseVersion: 4,
      status: "accepted" as const,
      acceptedAt: new Date(Date.now() - 31_000),
      runStatus: "awaiting_input",
      runPauseKind: "outline_approval" as const,
      runPauseVersion: 4,
      pauseRegisteredAt: new Date(Date.now() - 60_000),
      cancellationRequestedAt: null,
    };
    const update = updateQuery();
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select: vi.fn().mockReturnValue(joinedSelectLimit([row])),
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectLimit([{ status: "accepted" }])),
      update: update.update,
    });

    await expect(redeliverAcceptedAuthoringRunInput({ inputId: "input-1" })).resolves.toBe(
      "delivered",
    );
    expect(mocks.resumeHook).toHaveBeenCalledWith("authoring-input:run-1:outline_approval:4", {
      inputId: "input-1",
    });
    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "delivered",
        deliveredAt: expect.any(Date),
        lastDeliveryError: null,
      }),
    );
  });

  it.each([
    {
      name: "the response-loss grace has not elapsed",
      overrides: { acceptedAt: new Date(), runPauseVersion: 4 },
    },
    {
      name: "the run has advanced to a different pause version",
      overrides: { acceptedAt: new Date(Date.now() - 31_000), runPauseVersion: 5 },
    },
    {
      name: "the run is no longer awaiting input",
      overrides: {
        acceptedAt: new Date(Date.now() - 31_000),
        runPauseVersion: 4,
        runStatus: "running",
      },
    },
  ])("does not redeliver when $name", async ({ overrides }) => {
    const row = {
      id: "input-1",
      runId: "run-1",
      kind: "outline_approval" as const,
      pauseVersion: 4,
      status: "accepted" as const,
      runStatus: "awaiting_input",
      runPauseKind: "outline_approval" as const,
      pauseRegisteredAt: new Date(Date.now() - 60_000),
      cancellationRequestedAt: null,
      ...overrides,
    };
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select: vi.fn().mockReturnValue(joinedSelectLimit([row])),
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await expect(redeliverAcceptedAuthoringRunInput({ inputId: "input-1" })).resolves.toBe(
      "not_eligible",
    );
    expect(mocks.resumeHook).not.toHaveBeenCalled();
  });

  it("holds the project lock and refuses redelivery after cancellation wins", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select: vi.fn().mockReturnValue(
        joinedSelectLimit([
          {
            id: "input-1",
            runId: "run-1",
            kind: "outline_approval",
            pauseVersion: 4,
            status: "accepted",
            acceptedAt: new Date(Date.now() - 60_000),
            runStatus: "awaiting_input",
            runPauseKind: "outline_approval",
            runPauseVersion: 4,
            pauseRegisteredAt: new Date(Date.now() - 60_000),
            cancellationRequestedAt: new Date(),
          },
        ]),
      ),
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await expect(
      redeliverAcceptedAuthoringRunInput({ inputId: "input-1", minimumAgeMs: 0 }),
    ).resolves.toBe("not_eligible");
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(mocks.resumeHook).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("makes duplicate Workflow hook delivery read the same consumed payload without another write", async () => {
    const update = updateQuery();
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select: vi.fn().mockReturnValue(
        selectLimit([
          {
            id: "input-1",
            runId: "run-1",
            kind: "outline_approval",
            pauseVersion: 4,
            payload: { decision: "approved" },
            status: "consumed",
          },
        ]),
      ),
      update: update.update,
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await expect(
      consumeAuthoringRunInput({
        runId: "run-1",
        kind: "outline_approval",
        pauseVersion: 4,
        inputId: "input-1",
      }),
    ).resolves.toEqual({ decision: "approved" });
    expect(update.update).not.toHaveBeenCalled();
  });
});

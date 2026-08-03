import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withDbTransaction: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return {
    ...actual,
    withDbTransaction: mocks.withDbTransaction,
  };
});

import { persistRunEvent } from "@/lib/run-event-store";

function selectLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("persistRunEvent", () => {
  it("returns the original sequence for a replay without incrementing or projecting twice", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select: vi.fn().mockReturnValue(
        selectLimit([
          {
            id: "event-existing",
            seq: 7,
          },
        ]),
      ),
      insert: vi.fn(),
      update: vi.fn(),
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await expect(
      persistRunEvent({
        runId: "run-1",
        eventKey: "workflow-step:outline",
        event: { type: "stage", stage: "outline", pct: 15 },
      }),
    ).resolves.toEqual({
      id: "event-existing",
      seq: 7,
      inserted: false,
    });
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("uses the locked run counter and atomically projects stage progress", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "event-new", seq: 8 }]);
    const values = vi.fn().mockReturnValue({ returning });
    const eventInsert = vi.fn().mockReturnValue({ values });
    const where = vi.fn().mockResolvedValue([]);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const select = vi
      .fn()
      .mockReturnValueOnce(selectLimit([]))
      .mockReturnValueOnce(selectLimit([{ nextEventSeq: 8 }]))
      .mockReturnValueOnce(selectLimit([{ maxSeq: 7 }]));
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select,
      insert: eventInsert,
      update,
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await expect(
      persistRunEvent({
        runId: "run-1",
        eventKey: "workflow-step:chapter-2",
        event: {
          type: "stage",
          stage: "chapters",
          pct: 42,
          detail: "Drafting chapter 2",
        },
      }),
    ).resolves.toEqual({
      id: "event-new",
      seq: 8,
      inserted: true,
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        seq: 8,
        eventKey: "workflow-step:chapter-2",
        type: "stage",
      }),
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        nextEventSeq: 9,
        currentStage: "chapters",
        progressPct: 42,
        stageDescription: "Drafting chapter 2",
        heartbeatAt: expect.any(Date),
        lastProgressAt: expect.any(Date),
      }),
    );
  });

  it("records a failure as the canonical stage while preserving the stable root message", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "event-error", seq: 2 }]);
    const values = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select: vi
        .fn()
        .mockReturnValueOnce(selectLimit([]))
        .mockReturnValueOnce(selectLimit([{ nextEventSeq: 2 }]))
        .mockReturnValueOnce(selectLimit([{ maxSeq: 1 }])),
      insert: vi.fn().mockReturnValue({ values }),
      update: vi.fn().mockReturnValue({ set }),
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await persistRunEvent({
      runId: "run-1",
      eventKey: "workflow-step:failed",
      event: {
        type: "error",
        message: "Provider output was invalid",
        fatal: true,
      },
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        nextEventSeq: 3,
        currentStage: "failed",
        stageDescription: "Provider output was invalid",
      }),
    );
  });

  it("advances past legacy events inserted after the migration backfill", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "event-current", seq: 14 }]);
    const values = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      select: vi
        .fn()
        .mockReturnValueOnce(selectLimit([]))
        .mockReturnValueOnce(selectLimit([{ nextEventSeq: 8 }]))
        .mockReturnValueOnce(selectLimit([{ maxSeq: 13 }])),
      insert: vi.fn().mockReturnValue({ values }),
      update: vi.fn().mockReturnValue({ set }),
    };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await expect(
      persistRunEvent({
        runId: "run-legacy",
        eventKey: "workflow-step:after-legacy-event",
        event: { type: "stage", stage: "chapters", pct: 55 },
      }),
    ).resolves.toEqual({
      id: "event-current",
      seq: 14,
      inserted: true,
    });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ seq: 14 }));
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ nextEventSeq: 15 }));
  });
});

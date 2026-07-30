import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  getDb: vi.fn(),
  transaction: vi.fn(),
  releaseRun: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getSqlClient: mocks.getSqlClient, getDb: mocks.getDb };
});

vi.mock("@/lib/billing/credits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/credits")>();
  return {
    ...actual,
    releaseRunCreditReservations: mocks.releaseRun,
  };
});

import { insertQueuedAuthoringRun, terminalizeAuthoringRun } from "./generation-runs";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSqlClient.mockReturnValue({ transaction: mocks.transaction });
  mocks.releaseRun.mockResolvedValue(1);
});

function terminalDb(input: {
  status: "completed" | "failed" | "cancelled";
  hasWrittenChapter?: boolean;
  markerError?: Error;
}) {
  const execute = vi.fn().mockResolvedValue([]);
  const markerInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    }),
  });
  const nestedTransaction = vi.fn(
    async (work: (savepoint: { insert: typeof markerInsert }) => Promise<unknown>) => {
      if (input.markerError) throw input.markerError;
      return work({ insert: markerInsert });
    },
  );
  const projectSet = vi.fn();
  const runSet = vi.fn();
  const update = vi
    .fn()
    .mockImplementationOnce(() => ({
      set: (values: unknown) => {
        runSet(values);
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ status: input.status }]),
          }),
        };
      },
    }))
    .mockImplementationOnce(() => ({
      set: (values: unknown) => {
        projectSet(values);
        return { where: vi.fn().mockResolvedValue([]) };
      },
    }));
  const chapterRows = input.hasWrittenChapter ? [{ id: "chapter-1" }] : [];
  const limit = vi.fn().mockResolvedValue(chapterRows);
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit }),
      }),
    }),
  });
  const tx = { execute, transaction: nestedTransaction, update, select };
  mocks.getDb.mockReturnValue({
    transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  });
  return { execute, nestedTransaction, update, runSet, projectSet };
}

describe("insertQueuedAuthoringRun", () => {
  it("serializes run creation with structural mutations in one transaction", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      expect(queries).toHaveLength(2);
      expect(queries[0].strings.join("?")).toContain("pg_advisory_xact_lock");
      expect(queries[1].strings.join("?")).toContain("insert into generation_runs");
      return [[], [{ id: "run-1" }]];
    });

    await expect(
      insertQueuedAuthoringRun({
        projectId: "project-1",
        userId: "user-1",
        kind: "full_book",
        config: { tier: "standard" },
      }),
    ).resolves.toEqual({ id: "run-1" });
  });

  it("locks project then wallet, closes claims, and terminalizes atomically", async () => {
    const { execute, nestedTransaction, update, projectSet } = terminalDb({
      status: "failed",
      hasWrittenChapter: true,
    });

    await terminalizeAuthoringRun({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      status: "failed",
      error: "workflow start failed",
      releaseImmediately: true,
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(execute.mock.invocationCallOrder[1]);
    expect(execute.mock.invocationCallOrder[1]).toBeLessThan(
      nestedTransaction.mock.invocationCallOrder[0],
    );
    expect(nestedTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0],
    );
    expect(projectSet).toHaveBeenCalledWith(expect.objectContaining({ status: "editing" }));
    expect(mocks.releaseRun).toHaveBeenCalledWith({ runId: "run-1", userId: "user-1" });
  });

  it("still writes terminal state under the wallet lock if close-marker persistence fails", async () => {
    const { update, projectSet } = terminalDb({
      status: "cancelled",
      markerError: new Error("close marker unavailable"),
    });

    await terminalizeAuthoringRun({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      status: "cancelled",
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(projectSet).toHaveBeenCalledWith(expect.objectContaining({ status: "draft" }));
    expect(mocks.releaseRun).not.toHaveBeenCalled();
  });
});

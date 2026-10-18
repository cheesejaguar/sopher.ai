import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  withDbTransaction: vi.fn(),
  requireUser: vi.fn(),
  reconcileBeforeAuthoringRunConflict: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return {
    ...actual,
    getDb: mocks.getDb,
    withDbTransaction: mocks.withDbTransaction,
  };
});
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireUser: mocks.requireUser };
});
vi.mock("@/lib/generation-runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation-runs")>();
  return {
    ...actual,
    reconcileBeforeAuthoringRunConflict: mocks.reconcileBeforeAuthoringRunConflict,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("workflow/api", () => ({
  getRun: vi.fn(),
  start: mocks.start,
}));

import { deleteProject, setProjectArchived, updateProject } from "./projects";

function transactionDb(input: {
  selectResults: unknown[][];
  updateResults?: unknown[][];
  deleteResults?: unknown[][];
}) {
  const selectResults = [...input.selectResults];
  const updateResults = [...(input.updateResults ?? [])];
  const deleteResults = [...(input.deleteResults ?? [])];
  const execute = vi.fn().mockResolvedValue([]);
  const select = vi.fn(() => {
    const rows = selectResults.shift() ?? [];
    const result = {
      limit: vi.fn().mockResolvedValue(rows),
      then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => result),
      })),
    };
  });
  const update = vi.fn(() => {
    const rows = updateResults.shift() ?? [];
    return {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue(rows),
        })),
      })),
    };
  });
  const remove = vi.fn(() => {
    const rows = deleteResults.shift() ?? [];
    return {
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue(rows),
      })),
    };
  });
  const tx = { execute, select, update, delete: remove };
  const transaction = vi.fn(async (work: (transactionClient: typeof tx) => Promise<unknown>) =>
    work(tx),
  );
  mocks.withDbTransaction.mockImplementation(
    async (work: (transactionClient: typeof tx) => Promise<unknown>) => work(tx),
  );
  return { db: { transaction }, tx };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  mocks.reconcileBeforeAuthoringRunConflict.mockResolvedValue(undefined);
  mocks.start.mockResolvedValue({ runId: "cleanup-1" });
});

describe("project structural mutation locks", () => {
  it("acquires the shared project lock before snapshotting and updating settings", async () => {
    const { db, tx } = transactionDb({
      selectResults: [[{ id: "71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d" }]],
      updateResults: [[{ id: "71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d" }]],
    });
    mocks.getDb.mockReturnValue(db);

    await expect(
      updateProject("71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d", {
        targetChapters: 14,
        targetWordsPerChapter: 3_400,
      }),
    ).resolves.toBeUndefined();

    expect(tx.execute).toHaveBeenCalledOnce();
    expect(tx.execute.mock.invocationCallOrder[0]).toBeLessThan(
      tx.select.mock.invocationCallOrder[0],
    );
    expect(tx.select.mock.invocationCallOrder[0]).toBeLessThan(
      tx.update.mock.invocationCallOrder[0],
    );
  });

  it("distinguishes an owned project blocked by an active run", async () => {
    const { db } = transactionDb({
      selectResults: [[{ id: "71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d" }]],
      updateResults: [[]],
    });
    mocks.getDb.mockReturnValue(db);

    await expect(
      updateProject("71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d", { targetChapters: 14 }),
    ).rejects.toThrow("Finish or stop the current run before changing project settings");
  });

  it("checks for an active run and deletes only while holding the same project lock", async () => {
    const { db, tx } = transactionDb({
      selectResults: [[{ id: "71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d" }], [], [], []],
      deleteResults: [[{ id: "71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d" }]],
    });
    mocks.getDb.mockReturnValue(db);

    await expect(deleteProject("71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d")).resolves.toBeUndefined();

    expect(tx.execute).toHaveBeenCalledTimes(3);
    expect(tx.execute.mock.invocationCallOrder[0]).toBeLessThan(
      tx.select.mock.invocationCallOrder[0],
    );
    expect(tx.select.mock.invocationCallOrder[0]).toBeLessThan(
      tx.execute.mock.invocationCallOrder[1],
    );
    expect(tx.execute.mock.invocationCallOrder[2]).toBeLessThan(
      tx.select.mock.invocationCallOrder[1],
    );
    expect(tx.select).toHaveBeenCalledTimes(4);
    expect(tx.delete).toHaveBeenCalledOnce();
  });

  it("never issues the delete when the post-lock snapshot contains an active run", async () => {
    const { db, tx } = transactionDb({
      selectResults: [[{ id: "71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d" }], [{ id: "run-1" }]],
    });
    mocks.getDb.mockReturnValue(db);

    await expect(deleteProject("71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d")).rejects.toThrow(
      "Stop the current generation run before deleting this project",
    );
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("retains Blob pathnames in durable cleanup before cascade-deleting asset rows", async () => {
    const { db, tx } = transactionDb({
      selectResults: [
        [{ id: "71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d" }],
        [],
        [],
        [
          { pathname: "covers/71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d/cover.png" },
          { pathname: "exports/71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d/book.epub" },
        ],
      ],
      deleteResults: [[{ id: "71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d" }]],
    });
    mocks.getDb.mockReturnValue(db);

    await deleteProject("71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d");

    expect(mocks.start).toHaveBeenCalledWith(expect.any(Function), [
      "71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d",
      [
        "covers/71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d/cover.png",
        "exports/71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d/book.epub",
      ],
    ]);
    expect(mocks.start.mock.invocationCallOrder[0]).toBeLessThan(
      tx.delete.mock.invocationCallOrder[0],
    );
  });

  it("keeps terminal projects with open billing protocol rows undeletable", async () => {
    const { db, tx } = transactionDb({
      selectResults: [
        [{ id: "71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d" }],
        [],
        [{ id: "open-intent" }],
      ],
    });
    mocks.getDb.mockReturnValue(db);

    await expect(deleteProject("71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d")).rejects.toThrow(
      "Wait for pending generation charges to reconcile before deleting this project",
    );
    expect(tx.delete).not.toHaveBeenCalled();
  });
});

describe("project action id validation", () => {
  it.each([
    ["updateProject", () => updateProject("not-a-uuid", { targetChapters: 12 })],
    ["setProjectArchived", () => setProjectArchived("not-a-uuid", true)],
    ["deleteProject", () => deleteProject("not-a-uuid")],
  ])("%s treats a malformed id as not found before reconciling", async (_name, call) => {
    await expect(call()).rejects.toThrow("Project not found");
    expect(mocks.reconcileBeforeAuthoringRunConflict).not.toHaveBeenCalled();
  });

  it("refuses a non-boolean archive flag", async () => {
    await expect(
      setProjectArchived("71b0c5d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d", "yes" as unknown as boolean),
    ).rejects.toThrow("Invalid archive state");
    expect(mocks.reconcileBeforeAuthoringRunConflict).not.toHaveBeenCalled();
  });
});

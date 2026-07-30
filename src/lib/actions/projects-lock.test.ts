import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireUser: mocks.requireUser };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("workflow/api", () => ({
  getRun: vi.fn(),
  start: mocks.start,
}));

import { deleteProject, updateProject } from "./projects";

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
  return { db: { transaction }, tx };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  mocks.start.mockResolvedValue({ runId: "cleanup-1" });
});

describe("project structural mutation locks", () => {
  it("acquires the shared project lock before snapshotting and updating settings", async () => {
    const { db, tx } = transactionDb({
      selectResults: [[{ id: "project-1" }]],
      updateResults: [[{ id: "project-1" }]],
    });
    mocks.getDb.mockReturnValue(db);

    await expect(
      updateProject("project-1", {
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
      selectResults: [[{ id: "project-1" }]],
      updateResults: [[]],
    });
    mocks.getDb.mockReturnValue(db);

    await expect(updateProject("project-1", { targetChapters: 14 })).rejects.toThrow(
      "Finish or stop the current run before changing project settings",
    );
  });

  it("checks for an active run and deletes only while holding the same project lock", async () => {
    const { db, tx } = transactionDb({
      selectResults: [[{ id: "project-1" }], [], [], []],
      deleteResults: [[{ id: "project-1" }]],
    });
    mocks.getDb.mockReturnValue(db);

    await expect(deleteProject("project-1")).resolves.toBeUndefined();

    expect(tx.execute).toHaveBeenCalledTimes(2);
    expect(tx.execute.mock.invocationCallOrder[0]).toBeLessThan(
      tx.select.mock.invocationCallOrder[0],
    );
    expect(tx.select.mock.invocationCallOrder[0]).toBeLessThan(
      tx.execute.mock.invocationCallOrder[1],
    );
    expect(tx.execute.mock.invocationCallOrder[1]).toBeLessThan(
      tx.select.mock.invocationCallOrder[1],
    );
    expect(tx.select).toHaveBeenCalledTimes(4);
    expect(tx.delete).toHaveBeenCalledOnce();
  });

  it("never issues the delete when the post-lock snapshot contains an active run", async () => {
    const { db, tx } = transactionDb({
      selectResults: [[{ id: "project-1" }], [{ id: "run-1" }]],
    });
    mocks.getDb.mockReturnValue(db);

    await expect(deleteProject("project-1")).rejects.toThrow(
      "Stop the current generation run before deleting this project",
    );
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("retains Blob pathnames in durable cleanup before cascade-deleting asset rows", async () => {
    const { db, tx } = transactionDb({
      selectResults: [
        [{ id: "project-1" }],
        [],
        [],
        [{ pathname: "covers/project-1/cover.png" }, { pathname: "exports/project-1/book.epub" }],
      ],
      deleteResults: [[{ id: "project-1" }]],
    });
    mocks.getDb.mockReturnValue(db);

    await deleteProject("project-1");

    expect(mocks.start).toHaveBeenCalledWith(expect.any(Function), [
      "project-1",
      ["covers/project-1/cover.png", "exports/project-1/book.epub"],
    ]);
    expect(mocks.start.mock.invocationCallOrder[0]).toBeLessThan(
      tx.delete.mock.invocationCallOrder[0],
    );
  });

  it("keeps terminal projects with open billing protocol rows undeletable", async () => {
    const { db, tx } = transactionDb({
      selectResults: [[{ id: "project-1" }], [], [{ id: "open-intent" }]],
    });
    mocks.getDb.mockReturnValue(db);

    await expect(deleteProject("project-1")).rejects.toThrow(
      "Wait for pending generation charges to reconcile before deleting this project",
    );
    expect(tx.delete).not.toHaveBeenCalled();
  });
});

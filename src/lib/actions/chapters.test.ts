import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
  ownership: vi.fn(),
  revalidatePath: vi.fn(),
  getSqlClient: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb, getSqlClient: mocks.getSqlClient };
});

vi.mock("@/db/queries/books", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/queries/books")>();
  return { ...actual, getChapterOwnership: mocks.ownership };
});

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { moveChapter, renameChapter, restoreArchivedChapter, saveChapter } from "./chapters";
import { generationResetSource } from "@/lib/generation-archive";

function selectResult<T>(rows: T[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn().mockResolvedValue(rows);
  return chain;
}

function updateResult<T>(rows: T[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn().mockResolvedValue(rows);
  return chain;
}

const chapterId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  mocks.ownership.mockResolvedValue({
    chapterId,
    chapterNumber: 12,
    bookId: "book-1",
    projectId: "project-1",
    userId: "user-1",
  });
  mocks.getSqlClient.mockReturnValue({ transaction: mocks.transaction });
});

describe("restoreArchivedChapter", () => {
  it("restores only a soft-retired generation-reset snapshot as a drafted chapter", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(
        selectResult([
          {
            chapterNumber: 12,
            title: null,
            summary: null,
            content: "",
            wordCount: 0,
            status: "planned",
            version: 7,
          },
        ]),
      )
      .mockReturnValueOnce(
        selectResult([
          {
            content: "The archive doors opened at midnight.",
            source: generationResetSource({
              title: "The Original Archive",
              summary: "Mara recovers the hidden index.",
            }),
          },
        ]),
      );
    const update = vi.fn().mockReturnValue(updateResult([{ chapterNumber: 12, version: 8 }]));
    mocks.getDb.mockReturnValue({ select, update });

    await expect(restoreArchivedChapter(chapterId, revisionId)).resolves.toEqual({
      ok: true,
      chapterNumber: 12,
      version: 8,
    });

    const updateChain = update.mock.results[0]?.value;
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "The archive doors opened at midnight.",
        wordCount: 6,
        title: "The Original Archive",
        summary: "Mara recovers the hidden index.",
        status: "drafted",
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/projects/project-1");
  });

  it("refuses restoration while production is active", async () => {
    const select = vi.fn().mockReturnValueOnce(selectResult([{ id: "active-run" }]));
    const update = vi.fn();
    mocks.getDb.mockReturnValue({ select, update });

    await expect(restoreArchivedChapter(chapterId, revisionId)).resolves.toEqual({
      ok: false,
      error: "active_run",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps normal and already-restored chapters out of the archive action", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(
        selectResult([
          {
            chapterNumber: 12,
            title: null,
            summary: null,
            content: "The archive doors opened at midnight.",
            wordCount: 1_200,
            status: "drafted",
            version: 8,
          },
        ]),
      )
      .mockReturnValueOnce(selectResult([{ content: "The archive doors opened at midnight." }]));
    const update = vi.fn();
    mocks.getDb.mockReturnValue({ select, update });

    await expect(restoreArchivedChapter(chapterId, revisionId)).resolves.toEqual({
      ok: false,
      error: "not_archived",
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("saveChapter", () => {
  it("returns an editor conflict instead of overwriting an active generation run", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(selectResult([{ content: "Current prose", version: 4 }]))
      .mockReturnValueOnce(selectResult([{ id: "active-run" }]));
    const update = vi.fn();
    mocks.getDb.mockReturnValue({ select, update });

    await expect(saveChapter(chapterId, "My stale prose", 4, { force: true })).resolves.toEqual({
      ok: false,
      error: "conflict",
      currentVersion: 4,
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("chapter mutation ownership", () => {
  it("makes a rename conflict if a run starts between the precheck and update", async () => {
    const select = vi.fn().mockReturnValueOnce(selectResult([]));
    const update = vi.fn().mockReturnValue(updateResult([]));
    mocks.getDb.mockReturnValue({ select, update });

    await expect(renameChapter(chapterId, "A New Name")).rejects.toThrow(
      /finish or stop the current run/i,
    );
    expect(update.mock.results[0]?.value.set).toHaveBeenCalledWith(
      expect.objectContaining({ title: "A New Name", version: expect.anything() }),
    );
  });

  it("runs the entire three-step chapter swap in one rollback-capable transaction", async () => {
    const select = vi.fn().mockReturnValueOnce(selectResult([]));
    mocks.getDb.mockReturnValue({ select });
    const failure = new Error("neighbour update failed");
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      expect(queries).toHaveLength(5);
      expect(queries[0].strings.join("?")).toContain("pg_advisory_xact_lock");
      expect(
        queries
          .slice(2)
          .every((query: { strings: TemplateStringsArray }) =>
            query.strings.join("?").includes("update chapters"),
          ),
      ).toBe(true);
      throw failure;
    });

    await expect(moveChapter(chapterId, "down")).rejects.toBe(failure);
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
});

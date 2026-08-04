import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  withDbTransaction: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb, withDbTransaction: mocks.withDbTransaction };
});

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/generation-runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation-runs")>();
  return { ...actual, reconcileBeforeAuthoringRunConflict: mocks.reconcile };
});

import { applyBookReplace, previewBookReplace } from "./book-replace";
import { BOOK_REPLACE_REVISION_SOURCE } from "@/lib/editor/replace-plan";

const projectId = "aaaaaaaa-1111-4111-8111-111111111111";
const chapterOne = "bbbbbbbb-1111-4111-8111-111111111111";
const chapterTwo = "cccccccc-1111-4111-8111-111111111111";
const entityId = "dddddddd-1111-4111-8111-111111111111";

/** Terminal-only drizzle select chain: from → (innerJoin) → where → (orderBy|limit). */
function selectResult<T>(rows: T[]) {
  const chain: Record<string, unknown> = {};
  const step = () => chain;
  chain.from = vi.fn(step);
  chain.innerJoin = vi.fn(step);
  chain.orderBy = vi.fn().mockResolvedValue(rows);
  chain.limit = vi.fn().mockResolvedValue(rows);
  // Un-terminated selects (no limit/orderBy) resolve as a thenable.
  chain.then = (resolve: (value: T[]) => unknown) => Promise.resolve(rows).then(resolve);
  chain.where = vi.fn(step);
  return chain;
}

type ChapterRow = {
  id: string;
  chapterNumber: number;
  content: string;
  version: number;
};

/**
 * A transaction double shaped like the real one: an ordered queue of select
 * results, plus recorded inserts and version-guarded updates.
 */
function transactionDouble(options: {
  book?: { id: string };
  activeRun?: { id: string };
  chapters: ChapterRow[];
  entities?: Array<{ id: string; name: string; aliases: string[] }>;
  /** Simulates an autosave landing between the read and the guarded update. */
  updateBlockedFor?: string[];
}) {
  const queue: Array<Record<string, unknown>> = [
    selectResult(options.book ? [options.book] : []),
    selectResult(options.activeRun ? [options.activeRun] : []),
    selectResult(options.chapters),
  ];
  if (options.entities) queue.push(selectResult(options.entities));

  const inserted: Array<{ table: unknown; values: unknown }> = [];
  const updated: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const execute = vi.fn().mockResolvedValue([]);

  const tx = {
    execute,
    select: vi.fn(() => queue.shift() ?? selectResult([])),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (values: unknown) => {
        inserted.push({ table, values });
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updated.push({ table, values });
        const blocked =
          options.updateBlockedFor?.includes(String(values.content ?? "")) ||
          options.updateBlockedFor?.includes(String(values.name ?? ""));
        const where = vi.fn(() => ({
          returning: vi.fn().mockResolvedValue(blocked ? [] : [{ version: values.version }]),
        }));
        return Object.assign(where, { where, then: undefined });
      }),
    })),
  };

  mocks.withDbTransaction.mockImplementation(
    async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  );
  return { tx, inserted, updated, execute };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  mocks.reconcile.mockResolvedValue(undefined);
});

describe("previewBookReplace", () => {
  function dbWithBook(
    chapters: Array<{
      chapterId: string;
      chapterNumber: number;
      title: string | null;
      content: string;
      version: number;
    }>,
    entities: Array<{ id: string; kind: string; name: string; aliases: string[] }> = [],
  ) {
    const select = vi
      .fn()
      .mockReturnValueOnce(selectResult([{ id: "book-1" }]))
      .mockReturnValueOnce(selectResult(chapters))
      .mockReturnValueOnce(selectResult(entities));
    mocks.getDb.mockReturnValue({ select });
    return select;
  }

  it("counts matches per chapter, snippets them, and never writes", async () => {
    dbWithBook([
      {
        chapterId: chapterOne,
        chapterNumber: 1,
        title: "The Archive",
        content: "Mara opened the door. Mara did not look back.",
        version: 3,
      },
      {
        chapterId: chapterTwo,
        chapterNumber: 2,
        title: null,
        content: "Nobody was there.",
        version: 1,
      },
    ]);

    const result = await previewBookReplace(projectId, { query: "Mara", replacement: "Sera" });

    expect(result).toMatchObject({ ok: true, totalMatches: 2 });
    if (!result.ok) throw new Error("expected a preview");
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]).toMatchObject({
      chapterId: chapterOne,
      chapterNumber: 1,
      matchCount: 2,
      version: 3,
    });
    expect(result.chapters[0].snippets[0].match).toBe("Mara");
    expect(mocks.withDbTransaction).not.toHaveBeenCalled();
  });

  it("surfaces the bible entries whose name or aliases match, with the rename applied", async () => {
    dbWithBook(
      [
        {
          chapterId: chapterOne,
          chapterNumber: 1,
          title: null,
          content: "Mara waited.",
          version: 1,
        },
      ],
      [
        { id: entityId, kind: "character", name: "Mara Vance", aliases: ["The Archivist", "Mara"] },
        { id: "other", kind: "location", name: "The Vault", aliases: [] },
      ],
    );

    const result = await previewBookReplace(projectId, { query: "Mara", replacement: "Sera" });
    if (!result.ok) throw new Error("expected a preview");

    expect(result.entities).toEqual([
      {
        entityId,
        kind: "character",
        name: "Mara Vance",
        aliases: ["The Archivist", "Mara"],
        nameMatches: true,
        matchingAliases: ["Mara"],
        nextName: "Sera Vance",
        nextAliases: ["The Archivist", "Sera"],
      },
    ]);
  });

  it("refuses a book the caller does not own", async () => {
    const select = vi.fn().mockReturnValueOnce(selectResult([]));
    mocks.getDb.mockReturnValue({ select });

    await expect(previewBookReplace(projectId, { query: "Mara" })).resolves.toMatchObject({
      ok: false,
      error: "not_found",
    });
  });

  it("rejects an empty query before touching the database", async () => {
    mocks.getDb.mockReturnValue({ select: vi.fn() });
    await expect(previewBookReplace(projectId, { query: "" })).resolves.toMatchObject({
      ok: false,
      error: "invalid",
    });
  });
});

describe("applyBookReplace", () => {
  const applyInput = {
    query: "Mara",
    replacement: "Sera",
    chapters: [{ chapterId: chapterOne, version: 3 }],
  };

  it("snapshots the old prose, bumps the version, and reports the totals", async () => {
    const { inserted, updated } = transactionDouble({
      book: { id: "book-1" },
      chapters: [
        {
          id: chapterOne,
          chapterNumber: 1,
          content: "Mara opened the door. Mara did not look back.",
          version: 3,
        },
      ],
    });

    const result = await applyBookReplace(projectId, {
      ...applyInput,
      currentChapterId: chapterOne,
    });

    expect(result).toMatchObject({
      ok: true,
      chaptersChanged: 1,
      replacements: 2,
      entitiesRenamed: 0,
      currentChapter: {
        content: "Sera opened the door. Sera did not look back.",
        version: 4,
        wordCount: 9,
      },
    });
    // The pre-change prose is snapshotted under its own history source, so the
    // author can undo a book-wide rename from the chapter's History panel.
    expect(inserted).toHaveLength(1);
    expect(inserted[0].values).toEqual([
      {
        chapterId: chapterOne,
        content: "Mara opened the door. Mara did not look back.",
        source: BOOK_REPLACE_REVISION_SOURCE,
      },
    ]);
    expect(updated[0].values).toMatchObject({
      content: "Sera opened the door. Sera did not look back.",
      version: 4,
      wordCount: 9,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${projectId}`);
  });

  it("writes nothing when a chapter moved under the preview", async () => {
    const { inserted, updated } = transactionDouble({
      book: { id: "book-1" },
      chapters: [{ id: chapterOne, chapterNumber: 1, content: "Mara waited.", version: 5 }],
    });

    const result = await applyBookReplace(projectId, applyInput);

    expect(result).toMatchObject({
      ok: false,
      error: "conflict",
      conflicts: [
        { chapterId: chapterOne, chapterNumber: 1, expectedVersion: 3, currentVersion: 5 },
      ],
    });
    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(0);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("treats a chapter that disappeared as a conflict, not a silent skip", async () => {
    transactionDouble({ book: { id: "book-1" }, chapters: [] });

    await expect(applyBookReplace(projectId, applyInput)).resolves.toMatchObject({
      ok: false,
      error: "conflict",
      conflicts: [{ chapterId: chapterOne, chapterNumber: null, currentVersion: null }],
    });
  });

  it("rolls the whole replace back when an autosave wins the guarded update", async () => {
    // Two chapters match; the guarded update for the second one lands zero rows.
    const { updated } = transactionDouble({
      book: { id: "book-1" },
      chapters: [
        { id: chapterOne, chapterNumber: 1, content: "Mara waited.", version: 3 },
        { id: chapterTwo, chapterNumber: 2, content: "Mara left.", version: 2 },
      ],
      updateBlockedFor: ["Sera left."],
    });

    const result = await applyBookReplace(projectId, {
      ...applyInput,
      chapters: [
        { chapterId: chapterOne, version: 3 },
        { chapterId: chapterTwo, version: 2 },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      error: "conflict",
      conflicts: [{ chapterId: chapterTwo, chapterNumber: 2, expectedVersion: 2 }],
    });
    // The first chapter's update was issued but the transaction rolls it back;
    // what matters is that no success is reported and nothing is revalidated.
    expect(updated).toHaveLength(2);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses to run while a generation run owns the manuscript", async () => {
    const { inserted } = transactionDouble({
      book: { id: "book-1" },
      activeRun: { id: "run-1" },
      chapters: [{ id: chapterOne, chapterNumber: 1, content: "Mara waited.", version: 3 }],
    });

    await expect(applyBookReplace(projectId, applyInput)).resolves.toMatchObject({
      ok: false,
      error: "active_run",
    });
    expect(inserted).toHaveLength(0);
  });

  it("takes the project authoring lock before reading anything", async () => {
    const { tx, execute } = transactionDouble({
      book: { id: "book-1" },
      chapters: [{ id: chapterOne, chapterNumber: 1, content: "Mara waited.", version: 3 }],
    });

    await applyBookReplace(projectId, applyInput);

    expect(execute.mock.calls[0]?.[0]?.queryChunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: [expect.stringContaining("pg_advisory_xact_lock")] }),
      ]),
    );
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(tx.select.mock.invocationCallOrder[0]);
  });

  it("renames the opted-in bible entries in the same transaction", async () => {
    const { updated } = transactionDouble({
      book: { id: "book-1" },
      chapters: [{ id: chapterOne, chapterNumber: 1, content: "Mara waited.", version: 3 }],
      entities: [{ id: entityId, name: "Mara Vance", aliases: ["Mara"] }],
    });

    const result = await applyBookReplace(projectId, { ...applyInput, entityIds: [entityId] });

    expect(result).toMatchObject({ ok: true, entitiesRenamed: 1 });
    expect(updated[1].values).toMatchObject({ name: "Sera Vance", aliases: ["Sera"] });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${projectId}/bible`);
  });

  it("reports a duplicate canon name instead of a raw database error", async () => {
    mocks.withDbTransaction.mockRejectedValue(
      Object.assign(new Error('duplicate key value violates unique constraint "uq_entity_name"'), {
        code: "23505",
      }),
    );

    await expect(
      applyBookReplace(projectId, { ...applyInput, entityIds: [entityId] }),
    ).resolves.toMatchObject({ ok: false, error: "duplicate" });
  });

  it("rejects an apply with no chapters selected", async () => {
    await expect(
      applyBookReplace(projectId, { query: "Mara", replacement: "Sera", chapters: [] }),
    ).resolves.toMatchObject({ ok: false, error: "invalid" });
    expect(mocks.withDbTransaction).not.toHaveBeenCalled();
  });
});

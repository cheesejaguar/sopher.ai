import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  withDbTransaction: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, withDbTransaction: mocks.withDbTransaction };
});
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { updateBookPackage } from "./books";

function transactionWithBook(
  book:
    | {
        id: string;
        frontMatter: Record<string, unknown>;
      }
    | undefined,
) {
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(book ? [book] : []),
        })),
      })),
    })),
  }));
  const updates: Array<Record<string, unknown>> = [];
  const execute = vi.fn().mockResolvedValue([]);
  const update = vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      updates.push(values);
      return { where: vi.fn().mockResolvedValue(undefined) };
    }),
  }));
  const tx = { execute, select, update };
  mocks.withDbTransaction.mockImplementation(
    async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  );
  return { execute, select, update, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-1" });
});

describe("updateBookPackage", () => {
  it("atomically mirrors identity fields while preserving generated and future matter", async () => {
    const { execute, select, update, updates } = transactionWithBook({
      id: "book-1",
      frontMatter: {
        coverUrl: "https://assets.example.test/cover.png",
        futureLayout: "preserve-me",
        dedication: "Old dedication",
      },
    });

    await updateBookPackage("project-1", {
      title: "  The Finished Title  ",
      synopsis: "  A polished description.  ",
      author: "  A. Writer  ",
      dedication: "   ",
      copyrightYear: 2026,
    });

    expect(mocks.withDbTransaction).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]?.queryChunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: [expect.stringContaining("pg_advisory_xact_lock")] }),
      ]),
    );
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(select.mock.invocationCallOrder[0]);
    expect(update).toHaveBeenCalledTimes(2);
    expect(updates[0]).toEqual(
      expect.objectContaining({
        title: "The Finished Title",
        synopsis: "A polished description.",
        frontMatter: {
          coverUrl: "https://assets.example.test/cover.png",
          futureLayout: "preserve-me",
          author: "A. Writer",
          copyrightYear: 2026,
        },
        updatedAt: expect.any(Date),
      }),
    );
    expect(updates[1]).toEqual(
      expect.objectContaining({ title: "The Finished Title", updatedAt: expect.any(Date) }),
    );
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/projects/project-1",
      "/projects/project-1/book",
      "/projects/project-1/manuscript",
      "/studio",
    ]);
  });

  it("does not mutate or revalidate when the user does not own a book", async () => {
    const { update } = transactionWithBook(undefined);

    await expect(
      updateBookPackage("project-1", { title: "A title", synopsis: "A synopsis" }),
    ).rejects.toThrow("Book not found");

    expect(update).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

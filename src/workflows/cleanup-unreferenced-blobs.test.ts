import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  del: vi.fn(),
  withDbTransaction: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ del: mocks.del }));
vi.mock("workflow", () => ({ sleep: vi.fn() }));
vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, withDbTransaction: mocks.withDbTransaction };
});

import { deleteUnreferencedBlobsStep } from "./cleanup-unreferenced-blobs";

function cleanupDb(referenced: string[]) {
  const rows = referenced.map((pathname) => ({ pathname }));
  const query = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue(rows),
  };
  query.from.mockReturnValue(query);
  const tx = {
    execute: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockReturnValue(query),
  };
  mocks.withDbTransaction.mockImplementation(
    async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  );
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.del.mockResolvedValue(undefined);
});

describe("unreferenced Blob cleanup", () => {
  it("deletes only pathnames that never became asset rows", async () => {
    const tx = cleanupDb(["portraits/project/kept.png"]);

    await deleteUnreferencedBlobsStep("project-1", [
      "portraits/project/kept.png",
      "portraits/project/orphan.png",
      "portraits/project/orphan.png",
    ]);

    expect(tx.execute).toHaveBeenCalledOnce();
    expect(tx.execute.mock.invocationCallOrder[0]).toBeLessThan(
      tx.select.mock.invocationCallOrder[0],
    );
    expect(mocks.del).toHaveBeenCalledWith(["portraits/project/orphan.png"]);
  });

  it("keeps every referenced pathname", async () => {
    cleanupDb(["covers/project/cover.png"]);

    await deleteUnreferencedBlobsStep("project-1", ["covers/project/cover.png"]);

    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("surfaces storage failures so Workflow retries the durable step", async () => {
    cleanupDb([]);
    mocks.del.mockRejectedValue(new Error("Blob unavailable"));

    await expect(
      deleteUnreferencedBlobsStep("project-1", ["illustrations/project/image.png"]),
    ).rejects.toThrow("Blob unavailable");
  });
});

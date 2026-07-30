import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("workflow", () => ({
  FatalError: class FatalError extends Error {},
  getWritable: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});
vi.mock("@/lib/export/assemble", () => ({ loadManuscript: vi.fn() }));
vi.mock("@/lib/export", () => ({ renderExport: vi.fn() }));

import { markExportStatus } from "./export";

const ref = {
  dbRunId: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  userId: "user-1",
};

function queryResult<T>(rows: T[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function statusDb(updated: unknown[], existingStatus: string) {
  const returning = vi.fn().mockResolvedValue(updated);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  mocks.getDb.mockReturnValue({
    update: vi.fn().mockReturnValue({ set }),
    select: vi.fn().mockReturnValue(queryResult([{ status: existingStatus }])),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("export run status transitions", () => {
  it("treats a replay of the same committed transition as success", async () => {
    statusDb([], "running");

    await expect(markExportStatus(ref, "running")).resolves.toBe(true);
  });

  it("does not overwrite a different terminal state", async () => {
    statusDb([], "completed");

    await expect(markExportStatus(ref, "failed", "late event failure")).resolves.toBe(false);
  });

  it("returns success when the guarded mutation commits", async () => {
    statusDb([{ id: ref.dbRunId }], "queued");

    await expect(markExportStatus(ref, "completed")).resolves.toBe(true);
  });
});

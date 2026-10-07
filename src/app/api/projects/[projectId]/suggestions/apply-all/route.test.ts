import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  withDbTransaction: vi.fn(),
  requireUser: vi.fn(),
  active: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb, withDbTransaction: mocks.withDbTransaction };
});
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireUser: mocks.requireUser };
});
vi.mock("@/lib/generation-runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation-runs")>();
  return { ...actual, hasActiveAuthoringRun: mocks.active };
});

import { UnauthorizedError } from "@/lib/auth";
import { POST } from "./route";

const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

function call(body: unknown = { runId }) {
  return POST(new Request("http://test/api", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ projectId }),
  });
}

function ownedProject(rows: unknown[]) {
  const chain = { from: vi.fn(), where: vi.fn(), limit: vi.fn().mockResolvedValue(rows) };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  mocks.getDb.mockReturnValue({ select: vi.fn().mockReturnValue(chain) });
}

/** A transaction whose selects return the given rows in order. */
function transaction(selectResults: unknown[][], updateReturning: unknown[][] = []) {
  const updates: unknown[] = [];
  const tx = {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    select: vi.fn(() => {
      const rows = selectResults.shift() ?? [];
      const chain: Record<string, unknown> = {};
      for (const key of ["from", "innerJoin"]) chain[key] = vi.fn(() => chain);
      chain.where = vi.fn().mockResolvedValue(rows);
      return chain;
    }),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    update: vi.fn(() => ({
      set: vi.fn((values: unknown) => {
        updates.push(values);
        return {
          where: vi.fn(() => {
            const result = Promise.resolve(undefined) as Promise<undefined> & {
              returning: () => Promise<unknown[]>;
            };
            result.returning = vi.fn().mockResolvedValue(updateReturning.shift() ?? []);
            return result;
          }),
        };
      }),
    })),
  };
  mocks.withDbTransaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
  return { tx, updates };
}

const content = "The quick brown fox.";
const pending = {
  id: "s1",
  chapterId: "c1",
  chapterVersion: 2,
  anchor: { start: 4, end: 9, originalText: "quick" },
  suggestedText: "slow",
};

describe("POST /api/projects/[projectId]/suggestions/apply-all", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "user-1" });
    mocks.active.mockResolvedValue(false);
    ownedProject([{ id: projectId }]);
  });

  it("returns 401 rather than throwing for a signed-out caller", async () => {
    mocks.requireUser.mockRejectedValue(new UnauthorizedError());
    expect((await call()).status).toBe(401);
  });

  it("requires a runId so one review can never sweep up unrelated suggestions", async () => {
    expect((await call({})).status).toBe(400);
  });

  it("checks ownership before taking any lock", async () => {
    ownedProject([]);
    expect((await call()).status).toBe(404);
    expect(mocks.withDbTransaction).not.toHaveBeenCalled();
  });

  it("refuses while an authoring run is active", async () => {
    mocks.active.mockResolvedValue(true);
    const response = await call();
    expect(response.status).toBe(409);
    expect(mocks.withDbTransaction).not.toHaveBeenCalled();
  });

  it("applies the review and marks suggestions applied", async () => {
    const { updates } = transaction(
      [[pending], [{ id: "c1", content, version: 2 }]],
      [[{ id: "c1" }]],
    );
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ applied: 1, chaptersChanged: 1 });
    expect(updates[0]).toMatchObject({ content: "The slow brown fox.", version: 3 });
    expect(updates[1]).toEqual({ status: "applied" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${projectId}`, "layout");
  });

  it("rolls back (throws inside the transaction) when a guarded update loses its race", async () => {
    const { updates } = transaction([[pending], [{ id: "c1", content, version: 2 }]], [[]]);
    const response = await call();
    expect(response.status).toBe(409);
    // No suggestion status write happened after the failed chapter update.
    expect(updates).toHaveLength(1);
  });

  it("reports a stale review as a conflict without writing", async () => {
    const { tx } = transaction([[pending], [{ id: "c1", content, version: 5 }]]);
    expect((await call()).status).toBe(409);
    expect(tx.update).not.toHaveBeenCalled();
  });
});

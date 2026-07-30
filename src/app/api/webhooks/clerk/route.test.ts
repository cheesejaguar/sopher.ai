import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  getDb: vi.fn(),
  grantCredits: vi.fn(),
  reconcileCreditReservations: vi.fn(),
  start: vi.fn(),
  cleanupUserProjectBlobsAfterDelete: vi.fn(),
}));

vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: mocks.verifyWebhook,
}));
vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});
vi.mock("@/lib/billing/credits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/credits")>();
  return {
    ...actual,
    grantCredits: mocks.grantCredits,
    reconcileCreditReservations: mocks.reconcileCreditReservations,
  };
});
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("@/workflows/cleanup-project-blobs", () => ({
  cleanupUserProjectBlobsAfterDelete: mocks.cleanupUserProjectBlobsAfterDelete,
}));

import { POST } from "./route";

type Row = Record<string, unknown>;

function query(rows: Row[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    for: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
    then: (resolve: (value: Row[]) => unknown) => Promise.resolve(rows).then(resolve),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.for.mockReturnValue(chain);
  return chain;
}

function deletionDb(selectResults: Row[][], deleted = true) {
  const selects = [...selectResults];
  const deleteChain = {
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(deleted ? [{ id: "user-1" }] : []),
  };
  deleteChain.where.mockReturnValue(deleteChain);
  const tx = {
    select: vi.fn(() => query(selects.shift() ?? [])),
    execute: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(() => deleteChain),
  };
  const db = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  mocks.getDb.mockReturnValue(db);
  return { db, tx, deleteChain };
}

function request() {
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers: {
      "svix-id": "msg_1",
      "svix-timestamp": "1",
      "svix-signature": "v1,test",
    },
    body: "{}",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "whsec_test");
  mocks.verifyWebhook.mockResolvedValue({
    type: "user.deleted",
    data: { id: "user-1" },
  });
  mocks.start.mockResolvedValue({ runId: "cleanup-1" });
  mocks.reconcileCreditReservations.mockResolvedValue(0);
});

describe("Clerk user deletion", () => {
  it("rejects an invalid signature before touching data", async () => {
    mocks.verifyWebhook.mockRejectedValue(new Error("bad signature"));

    const response = await POST(request() as never);

    expect(response.status).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("is idempotent when a retried delivery finds no local user", async () => {
    const { tx } = deletionDb([[]]);

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ deleted: false });
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("asks Clerk to retry while authoring is active", async () => {
    const { tx } = deletionDb([[{ id: "user-1" }], [{ id: "project-1" }], [{ id: "run-1" }]]);

    const response = await POST(request() as never);

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(tx.execute).toHaveBeenCalledTimes(2);
    expect(tx.delete).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("asks Clerk to retry while a paid-call protocol is open", async () => {
    const { tx } = deletionDb([[{ id: "user-1" }], [], [], [{ id: "intent-1" }]]);

    const response = await POST(request() as never);

    expect(response.status).toBe(503);
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("durably captures every Blob pathname before the account cascade", async () => {
    const { tx, deleteChain } = deletionDb([
      [{ id: "user-1" }],
      [{ id: "project-1" }, { id: "project-2" }],
      [],
      [],
      [
        { projectId: "project-1", pathname: "covers/one.png" },
        { projectId: "project-1", pathname: "covers/one.png" },
        { projectId: "project-2", pathname: "exports/two.epub" },
      ],
    ]);

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ deleted: true });
    expect(tx.execute).toHaveBeenCalledTimes(3);
    expect(mocks.start).toHaveBeenCalledWith(mocks.cleanupUserProjectBlobsAfterDelete, [
      [
        { projectId: "project-1", pathnames: ["covers/one.png"] },
        { projectId: "project-2", pathnames: ["exports/two.epub"] },
      ],
    ]);
    expect(mocks.start.mock.invocationCallOrder[0]).toBeLessThan(
      deleteChain.returning.mock.invocationCallOrder[0],
    );
  });

  it("does not delete rows when durable cleanup cannot be scheduled", async () => {
    const { tx } = deletionDb([
      [{ id: "user-1" }],
      [{ id: "project-1" }],
      [],
      [],
      [{ projectId: "project-1", pathname: "covers/one.png" }],
    ]);
    mocks.start.mockRejectedValue(new Error("workflow unavailable"));

    await expect(POST(request() as never)).rejects.toThrow("workflow unavailable");
    expect(tx.delete).not.toHaveBeenCalled();
  });
});

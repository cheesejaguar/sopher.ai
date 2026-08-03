import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  httpClient: {},
  httpDb: { select: vi.fn() },
  poolConfigs: [] as Array<Record<string, unknown>>,
  poolEnds: [] as ReturnType<typeof vi.fn>[],
  serverlessDrizzle: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(() => mocks.httpClient),
  Pool: class Pool {
    end = vi.fn().mockResolvedValue(undefined);

    constructor(config: Record<string, unknown>) {
      mocks.poolConfigs.push(config);
      mocks.poolEnds.push(this.end);
    }
  },
}));
vi.mock("drizzle-orm/neon-http", () => ({
  drizzle: vi.fn(() => mocks.httpDb),
}));
vi.mock("drizzle-orm/neon-serverless", () => ({
  drizzle: mocks.serverlessDrizzle,
}));

import { getDb, withDbTransaction } from "./index";

const getDbExposesTransaction: "transaction" extends keyof ReturnType<typeof getDb> ? true : false =
  false;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://example.test/database");
  mocks.poolConfigs.length = 0;
  mocks.poolEnds.length = 0;
  mocks.serverlessDrizzle.mockReturnValue({ transaction: mocks.transaction });
});

describe("withDbTransaction", () => {
  it("keeps the default client on HTTP without exposing callback transactions", () => {
    expect(getDbExposesTransaction).toBe(false);
    expect(getDb()).toBe(mocks.httpDb);
    expect(mocks.poolConfigs).toHaveLength(0);
  });

  it("uses one request-scoped connection and closes it after commit", async () => {
    const tx = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    mocks.transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    );

    await expect(
      withDbTransaction(async (transaction) => {
        await transaction.execute(sql`select 1`);
        return "committed";
      }),
    ).resolves.toBe("committed");

    expect(mocks.poolConfigs).toEqual([
      { connectionString: "postgresql://example.test/database", max: 1 },
    ]);
    expect(mocks.poolEnds[0]).toHaveBeenCalledOnce();
  });

  it("forwards an explicit transaction isolation level", async () => {
    const tx = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    mocks.transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    );

    await withDbTransaction(async () => "captured", {
      isolationLevel: "repeatable read",
      accessMode: "read write",
    });

    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read write",
    });
  });

  it("closes the connection without masking a transaction failure", async () => {
    const failure = new Error("rollback");
    mocks.transaction.mockRejectedValue(failure);

    await expect(withDbTransaction(async () => "unreachable")).rejects.toBe(failure);
    expect(mocks.poolEnds[0]).toHaveBeenCalledOnce();
  });

  it("exposes Drizzle savepoints inside the outer transaction", async () => {
    const savepoint = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    const tx = {
      transaction: vi.fn(async (callback: (nested: typeof savepoint) => Promise<unknown>) =>
        callback(savepoint),
      ),
    };
    mocks.transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    );

    await withDbTransaction(async (transaction) => {
      await transaction.transaction(async (nested) => {
        await nested.execute(sql`select 1`);
      });
    });

    expect(tx.transaction).toHaveBeenCalledOnce();
    expect(savepoint.execute).toHaveBeenCalledOnce();
    expect(mocks.poolEnds[0]).toHaveBeenCalledOnce();
  });
});

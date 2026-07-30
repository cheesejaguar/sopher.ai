import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});

import { listLedger } from "./credits";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listLedger", () => {
  it("filters internal reservation protocol rows before applying the customer limit", async () => {
    let predicate: { getSQL(): unknown } | undefined;
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn((value) => {
      predicate = value;
      return { orderBy };
    });
    const from = vi.fn().mockReturnValue({ where });
    mocks.getDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from }) });

    await listLedger("user-1", 50);

    const query = new PgDialect().sqlToQuery(predicate!.getSQL() as never).sql;
    expect(query).toContain("metering-intent:");
    expect(query).toContain("metering-claim:");
    expect(query).toContain("generation-reservation:");
    expect(query).toContain("reservation-claim-release:");
    expect(query).not.toContain("delivery-refund:");
    expect(limit).toHaveBeenCalledWith(50);
  });
});

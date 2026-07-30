import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  getDb: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getSqlClient: mocks.getSqlClient, getDb: mocks.getDb };
});

import {
  assertCreditsForUsd,
  reconcileCreditReservations,
  releaseRunCreditReservations,
  reserveCredits,
} from "./credits";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSqlClient.mockReturnValue({ transaction: mocks.transaction });
});

describe("reserveCredits", () => {
  it("acquires the wallet lock in a prior transaction statement before reading balance", async () => {
    const transactions: Array<Array<{ strings: TemplateStringsArray; values: unknown[] }>> = [];
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      transactions.push(queries);
      const text = queries[1].strings.join("?");
      return text.includes("Reconcile expired credit reservation")
        ? [[], [{ released: 0 }]]
        : [[], [{ status: "reserved", balance: "12.5" }]];
    });

    await expect(
      reserveCredits({
        userId: "user-1",
        credits: 5,
        externalRef: "generation-reservation:run-1:wave-1",
        description: "Reserve chapter wave",
        projectId: "11111111-1111-4111-8111-111111111111",
        runId: "22222222-2222-4222-8222-222222222222",
      }),
    ).resolves.toMatchObject({ status: "reserved", balance: 12.5, credits: 5 });

    expect(transactions).toHaveLength(2);
    for (const queries of transactions) {
      expect(queries).toHaveLength(2);
      expect(queries[0].strings.join("?")).toContain("pg_advisory_xact_lock");
    }
    const reservationSql = transactions[1][1].strings.join("?");
    expect(reservationSql).toContain("insert into credit_ledger");
    expect(reservationSql).toContain("where wallet.balance >=");
    expect(reservationSql).toContain("project_id is not distinct from");
    expect(reservationSql).toContain("run_id is not distinct from");
  });

  it("releases only generation parent holds and subtracts transferred child capacity", async () => {
    let releaseSql = "";
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      releaseSql = queries[1].strings.join("?");
      return [[], [{ released: 2 }]];
    });

    await expect(releaseRunCreditReservations({ userId: "user-1", runId: "run-1" })).resolves.toBe(
      2,
    );

    expect(releaseSql).toContain("external_ref like 'generation-reservation:%'");
    expect(releaseSql).toContain("reservation-claim-release:");
    expect(releaseSql).not.toContain("external_ref like 'metering-claim:%'");
  });

  it("canonicalizes floating multi-child requirements before exact-balance reservation", async () => {
    let reservationValues: unknown[] = [];
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      const text = queries[1].strings.join("?");
      if (text.includes("Reconcile expired credit reservation")) {
        return [[], [{ released: 0 }]];
      }
      reservationValues = queries[1].values;
      return [[], [{ status: "reserved", balance: "1.2" }]];
    });

    await expect(
      reserveCredits({
        userId: "user-1",
        credits: 1.2000000000000002,
        externalRef: "generation-reservation:run-1:exact",
        description: "Exact sum of child claims",
      }),
    ).resolves.toMatchObject({ status: "reserved", balance: 1.2, credits: 1.2 });

    expect(reservationValues.map(String)).toContain("-1.2");
    expect(reservationValues.map(String)).not.toContain("-1.2000000000000002");
  });

  it("never expires new unresolved child claims or pending metering intents", async () => {
    let reconcileSql = "";
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      reconcileSql = queries[1].strings.join("?");
      return [[], [{ released: 0 }]];
    });

    await expect(reconcileCreditReservations("user-1")).resolves.toBe(0);

    expect(reconcileSql).toContain("interactive-reservation:%");
    expect(reconcileSql).toContain("generation-reservation:%");
    expect(reconcileSql).not.toContain("metering-claim:%");
    expect(reconcileSql).toContain("intent-settled:");
    expect(reconcileSql).toContain("intent-aborted:");
  });

  it("reconciles safely releasable parent holds before a route-level balance preflight", async () => {
    const order: string[] = [];
    mocks.transaction.mockImplementation(async (build) => {
      order.push("reconcile");
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      build(tx);
      return [[], [{ released: 1 }]];
    });
    const where = vi.fn().mockImplementation(async () => {
      order.push("balance");
      return [{ balance: "1" }];
    });
    const from = vi.fn().mockReturnValue({ where });
    mocks.getDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from }) });

    await expect(assertCreditsForUsd("user-1", 0.3)).resolves.toBeUndefined();

    expect(order).toEqual(["reconcile", "balance"]);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  getDb: vi.fn(),
  transaction: vi.fn(),
  cacheDelete: vi.fn(),
  assertProjectSpendAccess: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getSqlClient: mocks.getSqlClient, getDb: mocks.getDb };
});

vi.mock("@vercel/functions", () => ({
  getCache: () => ({
    delete: mocks.cacheDelete,
    get: vi.fn(),
    set: vi.fn(),
  }),
}));

vi.mock("@/lib/project-spend-access", () => ({
  assertProjectSpendAccess: mocks.assertProjectSpendAccess,
}));

import {
  abortMeteredCallIntent,
  beginMeteredCallIntent,
  reconcileMeteredCallAsCharged,
  reconcileMeteredCallAsUncharged,
  releaseReplayedOptionalOperationLeases,
  refundSettledLogicalUsageForRedo,
  ReservationSettlementError,
  recordLlmCallsAndDebit,
} from "./meter";

const firstRecord = {
  userId: "user-1",
  projectId: "11111111-1111-4111-8111-111111111111",
  runId: "22222222-2222-4222-8222-222222222222",
  agentRole: "writer",
  operation: "writer.draft",
  model: "anthropic/claude-sonnet-5",
  usage: {
    inputTokens: 1_000,
    outputTokens: 500,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
  },
};

const secondRecord = {
  ...firstRecord,
  model: "anthropic/claude-sonnet-4.6",
  usage: {
    inputTokens: 2_000,
    outputTokens: 750,
    cachedInputTokens: 100,
    cacheWriteTokens: 0,
  },
};

const debit = {
  description: "writer.draft",
  externalRefPrefix: "llm:generation:run-1:chapter:1:writer:writer.draft",
  intentRef: "metering-intent:generation:run-1:chapter:1:writer:writer.draft:attempt:one",
  reservationRef:
    "metering-claim:metering-intent:generation:run-1:chapter:1:writer:writer.draft:attempt:one",
};

function expectNoReservedAuthorizationCte(sqlText: string) {
  expect(sqlText).not.toMatch(/\bauthorization\s+as(?:\s+materialized)?\s*\(/i);
}

describe("PostgreSQL CTE identifiers", () => {
  it("never uses the reserved keyword authorization as a CTE name", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/billing/meter.ts"), "utf8");
    expectNoReservedAuthorizationCte(source);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSqlClient.mockReturnValue({ transaction: mocks.transaction });
  mocks.cacheDelete.mockResolvedValue(undefined);
  mocks.assertProjectSpendAccess.mockResolvedValue({
    experience: "full_book",
    fullBookUnlocked: true,
    allowCreditFloor: true,
  });
});

describe("recordLlmCallsAndDebit", () => {
  it("settles every provider step, usage debit, claim release, and intent atomically", async () => {
    let settlementQuery: { strings: TemplateStringsArray; values: unknown[] } | undefined;
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      settlementQuery = queries[1];
      return [
        [],
        [{ recorded: true, authorized: "10", required: "0.0660", debited_credits: "0.0660" }],
      ];
    });

    const settlement = await recordLlmCallsAndDebit([firstRecord, secondRecord], debit);
    expect(settlement.meteredUsd).toBeCloseTo(0.02398, 6);
    expect(settlement.debitedCredits).toBe(0.066);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(settlementQuery).toBeDefined();
    const queryText = settlementQuery!.strings.join("?");
    const queryValues = settlementQuery!.values.map(String);
    expect(queryText).toContain("jsonb_to_recordset");
    expect(queryText).toContain("insert into llm_calls");
    expect(queryText).toContain("insert into credit_ledger");
    expect(queryText).toContain("usage_insert");
    expect(queryText).toContain("usage_conflict");
    expect(queryText).toContain("existing_settlement");
    expect(queryText).toContain("authorized_settlement as materialized");
    expectNoReservedAuthorizationCte(queryText);
    expect(queryText).toContain("numeric(12, 4)");
    expect(queryText).toContain("debited_credits");
    expect(queryText).toContain("release_insert");
    expect(queryText).toContain("settled_intent");
    expect(queryText).toContain("<= claim.authorized");
    expect(queryValues.join("\n")).toContain("anthropic/claude-sonnet-5");
    expect(queryValues.join("\n")).toContain("anthropic/claude-sonnet-4.6");
    expect(queryValues.join("\n")).toContain(`${debit.externalRefPrefix}:step:0`);
    expect(queryValues.join("\n")).toContain(`${debit.externalRefPrefix}:step:1`);
    expect(mocks.cacheDelete).toHaveBeenCalledWith("spend:user-1");
  });

  it("fails closed without invalidating cache when the claim cannot authorize settlement", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      build(tx);
      return [
        [],
        [{ recorded: false, authorized: "0.001", required: "0.0193", debited_credits: "0" }],
      ];
    });

    await expect(recordLlmCallsAndDebit([firstRecord], debit)).rejects.toBeInstanceOf(
      ReservationSettlementError,
    );
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.cacheDelete).not.toHaveBeenCalled();
  });

  it("rejects a settlement spanning two wallets before issuing SQL", async () => {
    await expect(
      recordLlmCallsAndDebit([{ ...firstRecord }, { ...secondRecord, userId: "user-2" }], debit),
    ).rejects.toThrow("cannot span wallets");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a settlement spanning project or run scopes before issuing SQL", async () => {
    await expect(
      recordLlmCallsAndDebit(
        [
          { ...firstRecord },
          {
            ...secondRecord,
            projectId: "33333333-3333-4333-8333-333333333333",
          },
        ],
        debit,
      ),
    ).rejects.toThrow("cannot span project or run scopes");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns the exact aggregate of individually quantized ledger debits", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      build(tx);
      return [
        [],
        [{ recorded: true, authorized: "1", required: "0.0002", debited_credits: "0.0002" }],
      ];
    });
    const fractional = {
      ...firstRecord,
      model: "anthropic/claude-haiku-4.5",
      usage: {
        inputTokens: 20,
        outputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
      },
    };

    await expect(recordLlmCallsAndDebit([fractional, fractional], debit)).resolves.toEqual({
      meteredUsd: 0.00004,
      // Each raw 0.000055-credit debit rounds to numeric(12,4) 0.0001.
      debitedCredits: 0.0002,
    });
  });
});

describe("metered intent authorization", () => {
  it("settles administrator-verified charged usage through the original claim", async () => {
    let reconciliationQueries: Array<{
      strings: TemplateStringsArray;
      values: unknown[];
    }> = [];
    let settlementValues: unknown[] = [];
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      reconciliationQueries = queries;
      settlementValues = queries[1].values;
      return [
        [],
        [
          {
            recorded: true,
            authorized: "1",
            required: "0.0193",
            debited_credits: "0.0193",
            user_id: "user-1",
          },
        ],
      ];
    });

    await expect(
      reconcileMeteredCallAsCharged({
        intentRef: debit.intentRef,
        adminId: "admin-1",
        note: "Matched Gateway generation gen_123",
        calls: [
          {
            model: "anthropic/claude-sonnet-5",
            inputTokens: 1_000,
            outputTokens: 500,
          },
        ],
      }),
    ).resolves.toEqual({ meteredUsd: 0.007, debitedCredits: 0.0193 });

    expect(settlementValues.map(String).join("\n")).toContain(
      "Admin admin-1 verified Gateway charge",
    );
    expect(settlementValues.map(String).join("\n")).toContain(
      "llm:generation:run-1:chapter:1:writer:writer.draft:attempt:one",
    );
    expect(settlementValues.map(String).join("\n")).toContain(
      "delivery-refund:llm:generation:run-1:chapter:1:writer:writer.draft:attempt:one",
    );
    expect(reconciliationQueries[0].strings.join("?")).toContain("pg_advisory_xact_lock");
    expect(reconciliationQueries[0].strings.join("?")).toContain("interval '1 hour'");
    const settlementSql = reconciliationQueries[1].strings.join("?");
    expect(settlementSql).toContain("authorized_reconciliation as materialized");
    expectNoReservedAuthorizationCte(settlementSql);
    expect(settlementSql).toContain("claim.project_id is not distinct from intent.project_id");
    expect(settlementSql).toContain("delivery_refund");
    expect(settlementSql).toContain("compensated_parent_restore");
    expect(settlementSql).toContain("'release:' || parent.external_ref");
  });

  it("refuses to terminalize a charged reconciliation with zero billable usage", async () => {
    await expect(
      reconcileMeteredCallAsCharged({
        intentRef: debit.intentRef,
        adminId: "admin-1",
        note: "Gateway record had no billable units",
        calls: [
          {
            model: "anthropic/claude-sonnet-5",
            inputTokens: 0,
            outputTokens: 0,
          },
        ],
      }),
    ).rejects.toThrow("positive billable usage");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("restores transferred phase capacity when dispatch is proven not to have started", async () => {
    let abortSql = "";
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      abortSql = queries[1].strings.join("?");
      return [[], [{ released: true, parent_restored: true }]];
    });

    await abortMeteredCallIntent({
      userId: "user-1",
      projectId: firstRecord.projectId,
      runId: firstRecord.runId,
      intentRef: debit.intentRef,
      reservationRef: debit.reservationRef,
    });

    expect(abortSql).toContain("parent_claim");
    expect(abortSql).toContain("parent_restored");
    expect(abortSql).toContain("Restore phase capacity");
    expect(abortSql).toContain("parent_claim.external_ref || ':restore'");
    expect(abortSql).toContain("intent.kind = 'adjustment'");
    expect(abortSql).toContain("intent.amount = 0");
    expect(abortSql).toContain("intent.project_id is not distinct from");
    expect(abortSql).toContain("intent.run_id is not distinct from");
    expect(abortSql).toContain("inner join intent");
    expect(abortSql).toContain("released.external_ref =");
    expect(abortSql).toContain("'release:' || parent.external_ref");
  });

  it("locks the wallet before the snapshot that creates child claim, parent transfer, and intent", async () => {
    let queries: Array<{ strings: TemplateStringsArray; values: unknown[] }> = [];
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      queries = build(tx);
      return [[], [{ status: "started", balance: "8", required: "0" }]];
    });

    await expect(
      beginMeteredCallIntent({
        userId: "user-1",
        projectId: firstRecord.projectId,
        runId: firstRecord.runId,
        intentRef: debit.intentRef,
        intentPrefix: "metering-intent:generation:run-1:chapter:1:writer.draft:attempt:",
        usagePrefix: debit.externalRefPrefix,
        parentReservationRef: "generation-reservation:run-1:wave-1",
        maxCredits: 4,
        description: "Metering intent for writer.draft",
      }),
    ).resolves.toMatchObject({ status: "started", reservationRef: debit.reservationRef });

    expect(mocks.assertProjectSpendAccess).toHaveBeenCalledWith({
      userId: "user-1",
      projectId: firstRecord.projectId,
      operationKind: "authoring",
    });
    expect(queries).toHaveLength(2);
    expect(queries[0].strings.join("?")).toContain("pg_advisory_xact_lock");
    const authorizationSql = queries[1].strings.join("?");
    expect(authorizationSql).toContain("authorized_start as materialized");
    expectNoReservedAuthorizationCte(authorizationSql);
    expect(authorizationSql).toContain("claim_insert");
    expect(authorizationSql).toContain("parent_claim");
    expect(authorizationSql).toContain("intent_insert");
    expect(authorizationSql).toContain("regexp_replace");
    expect(authorizationSql).toContain("delivery-refund:");
    expect(authorizationSql).toContain("from generation_runs active_run");
    expect(authorizationSql).toContain(
      "active_run.status in ('queued', 'running', 'awaiting_input')",
    );
    expect(queries[1].values.map(String).join("\n")).toContain("reservation-close-request:");
    expect(authorizationSql).toContain("wallet.balance >=");
    expect(authorizationSql).toContain("project_access");
    expect(authorizationSql).toContain("trial_spend");
    expect(authorizationSql).toContain("credits_used");
    expect(authorizationSql).toContain("credits_held");
    expect(authorizationSql).toContain("purchase.kind = 'purchase'");
    expect(authorizationSql).toContain("author.role = 'admin'");
  });

  it("atomically excludes optional trial work from active generation and the shared cap", async () => {
    let queries: Array<{ strings: TemplateStringsArray; values: unknown[] }> = [];
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      queries = build(tx);
      return [[], [], [{ status: "trial_cap", balance: "100", required: "4" }]];
    });

    await expect(
      beginMeteredCallIntent({
        userId: "user-1",
        projectId: firstRecord.projectId,
        runId: null,
        intentRef: debit.intentRef,
        intentPrefix: "metering-intent:interactive:user-1:key:tool:attempt:",
        usagePrefix: "llm:interactive:user-1:key:tool:",
        maxCredits: 4,
        description: "Metering intent for an optional tool",
      }),
    ).resolves.toMatchObject({ status: "trial_cap", balance: 100 });

    expect(mocks.assertProjectSpendAccess).toHaveBeenCalledWith({
      userId: "user-1",
      projectId: firstRecord.projectId,
      operationKind: "optional",
    });
    const sqlText = queries[2].strings.join("?");
    expect(sqlText).toContain("competing_run.status in ('queued', 'running', 'awaiting_input')");
    expect(sqlText).toContain("competing_run.kind <> 'export'");
    expect(sqlText).toContain("spent.credits_used");
    expect(sqlText).toContain("spent.credits_held");
    expect(sqlText).toContain("trial_cap_blocked");
    expect(sqlText).toContain("optional_lease");
    expect(queries[2].values.map(String).join("\n")).toContain("optional-operation-lease:");
    expect(sqlText).toContain("> ?");
    expect(queries[2].values.map(String)).toContain("10");
  });

  it("rechecks suspension inside the wallet-locked authorization transaction", async () => {
    let authorizationSql = "";
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      authorizationSql = queries.at(-1)!.strings.join("?");
      return [[], [{ status: "suspended", balance: "10", required: "1" }]];
    });

    await expect(
      beginMeteredCallIntent({
        userId: "user-1",
        projectId: firstRecord.projectId,
        runId: firstRecord.runId,
        intentRef: debit.intentRef,
        intentPrefix: "metering-intent:generation:run-1:chapter:1:writer.draft:attempt:",
        usagePrefix: debit.externalRefPrefix,
        maxCredits: 1,
        description: "Metering intent for writer.draft",
      }),
    ).resolves.toMatchObject({ status: "suspended" });

    expect(authorizationSql).toContain("author.suspended");
    expect(authorizationSql).toContain("where not access.suspended");
    expect(authorizationSql).toContain("then 'suspended'");
  });

  it("repairs an optional delivery lease only for the exact replay key", async () => {
    let repairSql = "";
    let repairValues: unknown[] = [];
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      repairSql = queries[1].strings.join("?");
      repairValues = queries[1].values;
      return [[], []];
    });

    await releaseReplayedOptionalOperationLeases({
      userId: "user-1",
      projectId: firstRecord.projectId,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
    });

    expect(repairSql).toContain("'release:' || lease.external_ref");
    expect(repairSql).toContain("optional-operation-lease:%");
    expect(repairSql).toContain("on conflict (external_ref) do nothing");
    expect(repairValues.map(String)).toContain("%:33333333-3333-4333-8333-333333333333:%");
  });

  it("requires an aged unresolved intent and explicit terminal/release checks for operator recovery", async () => {
    let reconciliationSql = "";
    let reconciliationValues: unknown[] = [];
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      reconciliationSql = queries[1].strings.join("?");
      reconciliationValues = queries[1].values;
      return [[], [{ released: true }]];
    });

    await expect(
      reconcileMeteredCallAsUncharged({
        intentRef: debit.intentRef,
        adminId: "admin-1",
        note: "No generation exists for the unique attempt tag",
      }),
    ).resolves.toBe(true);

    expect(reconciliationSql).toContain("interval '1 hour'");
    expect(reconciliationValues.map(String).join("\n")).toContain("intent-settled:");
    expect(reconciliationValues.map(String).join("\n")).toContain("intent-aborted:");
    expect(reconciliationValues.map(String).join("\n")).toContain("release:");
    expect(reconciliationSql).toContain("claim.project_id is not distinct from intent.project_id");
    expect(reconciliationSql).toContain("claim.run_id is not distinct from intent.run_id");
    expect(reconciliationSql).toContain(
      "target.project_id is not distinct from claimed.project_id",
    );
    expect(reconciliationSql).toContain("'release:' || parent.external_ref");
  });

  it("restores compensated-redo capacity only while the parent hold is open", async () => {
    let retrySql = "";
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      retrySql = queries[1].strings.join("?");
      return [[], [{ refunded: true }]];
    });

    await expect(
      refundSettledLogicalUsageForRedo({
        userId: "user-1",
        usagePrefix: "llm:generation:run-1:chapter:1:writer:writer.draft:",
      }),
    ).resolves.toBe(true);

    expect(retrySql).toContain("parent_claim");
    expect(retrySql).toContain("claimed.project_id is not distinct from attempts.project_id");
    expect(retrySql).toContain("claimed.run_id is not distinct from attempts.run_id");
    expect(retrySql).toContain("'release:' || parent.external_ref");
    expect(retrySql).toContain("parent_claim.external_ref || ':delivery-restore'");
  });
});

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import type { DbTransaction } from "@/db";
import {
  repairDeliveredOptionalOperationLeases,
  setProjectArchivedTransaction,
  unreleasedBillingProtocolSql,
  wizardInputsRemainMutableSql,
} from "@/lib/project-transaction-operations";

describe("wizardInputsRemainMutableSql", () => {
  it("allows only terminal zero-work starts and freezes every authoring evidence path", () => {
    const query = new PgDialect().sqlToQuery(
      wizardInputsRemainMutableSql("11111111-1111-4111-8111-111111111111"),
    ).sql;

    expect(query).toContain(`"generation_runs"."status" not in ('failed', 'cancelled')`);
    expect(query).toContain(
      `"generation_events"."type" in ('agent', 'chapter', 'review', 'tool_mutation')`,
    );
    expect(query).toContain(`"generation_events"."payload"->>'stage' <> 'queued'`);
    expect(query).toContain('from "llm_calls"');
    expect(query).toContain(`"credit_ledger"."kind" = 'usage'`);
    expect(query).toContain("generation-reservation:");
    expect(query).toContain("interactive-reservation:");
  });
});

describe("unreleasedBillingProtocolSql", () => {
  it("keeps project and account deletion closed until optional delivery leases release", () => {
    const query = new PgDialect().sqlToQuery(
      unreleasedBillingProtocolSql({
        userId: "user-1",
        projectId: "11111111-1111-4111-8111-111111111111",
      })!,
    ).sql;

    expect(query).toContain("optional-operation-lease:");
    expect(query).toContain("released_optional_operation.external_ref");
    expect(query).toContain("'release:' ||");
    expect(query).toContain("metering-intent:");
  });

  it("repairs only leases with durable operation-key evidence", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    await repairDeliveredOptionalOperationLeases({ execute } as unknown as DbTransaction, {
      userId: "user-1",
      projectId: "11111111-1111-4111-8111-111111111111",
    });
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]).sql;

    expect(query).toContain("optional-operation-lease:");
    expect(query).toContain("operationKey");
    expect(query).toContain("assets");
    expect(query).toContain("content_tool_runs");
    expect(query).toContain("suggestions");
    expect(query).toContain("'release:' || optional_lease.external_ref");
  });
});

function selectResult<T>(rows: T[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn().mockResolvedValue(rows);
  return chain;
}

function updateResult<T>(rows: T[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn().mockResolvedValue(rows);
  return chain;
}

function transaction(input: { selections: unknown[][]; updated?: unknown[] }) {
  const execute = vi.fn().mockResolvedValue([]);
  const select = vi.fn();
  for (const rows of input.selections) select.mockReturnValueOnce(selectResult(rows));
  const updateChain = updateResult(input.updated ?? [{ id: "project-1" }]);
  const update = vi.fn().mockReturnValue(updateChain);
  return {
    tx: { execute, select, update } as unknown as DbTransaction,
    execute,
    update,
    updateChain,
  };
}

describe("setProjectArchivedTransaction", () => {
  it("rejects archive while a non-export authoring run is active under the project lock", async () => {
    const fixture = transaction({
      selections: [[{ id: "project-1" }], [{ id: "run-1" }]],
    });

    await expect(
      setProjectArchivedTransaction(fixture.tx, {
        projectId: "project-1",
        userId: "user-1",
        archived: true,
      }),
    ).resolves.toBe("active_run");

    expect(fixture.execute).toHaveBeenCalledOnce();
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it("restores a full-looking manuscript as in progress without run-owned completion proof", async () => {
    const fixture = transaction({
      selections: [[{ id: "project-1" }], [], [{ completionReady: false, writtenChapters: 3 }]],
    });

    await expect(
      setProjectArchivedTransaction(fixture.tx, {
        projectId: "project-1",
        userId: "user-1",
        archived: false,
      }),
    ).resolves.toBe("updated");

    expect(fixture.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "editing" }),
    );
  });

  it("restores complete only when the final manuscript is bound to its completed run", async () => {
    const fixture = transaction({
      selections: [[{ id: "project-1" }], [], [{ completionReady: true, writtenChapters: 3 }]],
    });

    await expect(
      setProjectArchivedTransaction(fixture.tx, {
        projectId: "project-1",
        userId: "user-1",
        archived: false,
      }),
    ).resolves.toBe("updated");

    expect(fixture.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "complete" }),
    );
  });
});

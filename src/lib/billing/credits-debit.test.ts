import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});

import { debitCredits } from "./credits";

function insertChain(returned: Array<{ id: string }>) {
  const chain = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn().mockResolvedValue(returned),
  };
  chain.values.mockReturnValue(chain);
  chain.onConflictDoNothing.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("debitCredits logical-call idempotency", () => {
  it("uses the unique external reference so a repeated logical call debits once", async () => {
    const first = insertChain([{ id: "ledger-1" }]);
    const duplicate = insertChain([]);
    const insert = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(duplicate);
    mocks.getDb.mockReturnValue({ insert });

    const input = {
      userId: "user-1",
      meteredUsd: 1,
      description: "writer.draft",
      externalRef: "llm:run-1:chapter-2:writer.draft",
    };
    await expect(debitCredits(input)).resolves.toBe(true);
    await expect(debitCredits(input)).resolves.toBe(false);

    expect(first.values).toHaveBeenCalledWith(
      expect.objectContaining({ externalRef: input.externalRef }),
    );
    expect(duplicate.onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it("keeps distinct chapter/operation references independently billable", async () => {
    const first = insertChain([{ id: "ledger-1" }]);
    const second = insertChain([{ id: "ledger-2" }]);
    mocks.getDb.mockReturnValue({
      insert: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
    });

    await expect(
      debitCredits({
        userId: "user-1",
        meteredUsd: 1,
        description: "writer.plan",
        externalRef: "llm:run-1:chapter-1:writer.plan",
      }),
    ).resolves.toBe(true);
    await expect(
      debitCredits({
        userId: "user-1",
        meteredUsd: 1,
        description: "writer.plan",
        externalRef: "llm:run-1:chapter-2:writer.plan",
      }),
    ).resolves.toBe(true);
  });

  it("retains legacy append-only behavior when no reference is supplied", async () => {
    const chain = insertChain([]);
    mocks.getDb.mockReturnValue({ insert: vi.fn().mockReturnValue(chain) });

    await expect(
      debitCredits({
        userId: "user-1",
        meteredUsd: 1,
        description: "editor.review",
      }),
    ).resolves.toBe(true);
    expect(chain.onConflictDoNothing).not.toHaveBeenCalled();
  });
});

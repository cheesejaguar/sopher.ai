import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ id: string }>,
  where: vi.fn(),
}));

vi.mock("@/db", () => ({
  schema: {
    creditLedger: {
      id: "credit_ledger.id",
      userId: "credit_ledger.user_id",
      externalRef: "credit_ledger.external_ref",
      kind: "credit_ledger.kind",
      amount: "credit_ledger.amount",
    },
  },
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: (...args: unknown[]) => {
          mocks.where(...args);
          return {
            limit: async () => mocks.rows,
          };
        },
      }),
    }),
  }),
}));

import { checkoutSessionId, hasOwnedSettledCheckout } from "./checkout-return";

beforeEach(() => {
  mocks.rows = [];
  mocks.where.mockReset();
});

describe("checkout return settlement", () => {
  it("accepts bounded Stripe Checkout Session ids and rejects arbitrary return input", () => {
    expect(checkoutSessionId("cs_test_author_purchase_123456")).toBe(
      "cs_test_author_purchase_123456",
    );
    expect(checkoutSessionId("pi_not_a_checkout_session")).toBeNull();
    expect(checkoutSessionId("cs_test_bad?query=1")).toBeNull();
    expect(checkoutSessionId(undefined)).toBeNull();
  });

  it("does not query the ledger without a valid session id", async () => {
    await expect(hasOwnedSettledCheckout({ userId: "user_author", sessionId: null })).resolves.toBe(
      false,
    );
    expect(mocks.where).not.toHaveBeenCalled();
  });

  it("requires the exact user-owned positive purchase ledger row", async () => {
    mocks.rows = [{ id: "ledger_purchase" }];

    await expect(
      hasOwnedSettledCheckout({
        userId: "user_author",
        sessionId: "cs_test_author_purchase_123456",
      }),
    ).resolves.toBe(true);
    expect(mocks.where).toHaveBeenCalledOnce();
  });
});

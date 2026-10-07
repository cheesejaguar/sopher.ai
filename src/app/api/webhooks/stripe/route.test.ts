import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieveCharge: vi.fn(),
  listRefunds: vi.fn(),
  grantCredits: vi.fn(),
  sendReceiptEmail: vi.fn(),
  ledgerRows: vi.fn(),
}));

vi.mock("@/lib/payments/stripe", () => ({
  stripeConfigured: true,
  getStripe: () => ({
    webhooks: { constructEventAsync: mocks.constructEvent },
    charges: { retrieve: mocks.retrieveCharge },
    refunds: { list: mocks.listRefunds },
  }),
}));
vi.mock("@/lib/billing/credits", () => ({ grantCredits: mocks.grantCredits }));
vi.mock("@/lib/email/send", () => ({ sendReceiptEmail: mocks.sendReceiptEmail }));
vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => mocks.ledgerRows(),
  };
  return { ...actual, getDb: () => ({ select: () => chain }) };
});

import { POST } from "./route";

function deliver(event: unknown) {
  mocks.constructEvent.mockResolvedValue(event);
  return POST(
    new Request("https://sopher.ai/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=sig" },
      body: "{}",
    }),
  );
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_1",
    payment_status: "paid",
    amount_total: 6000,
    metadata: { userId: "user-1", credits: "66", packId: "author" },
    client_reference_id: "user-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  mocks.grantCredits.mockResolvedValue(false);
  mocks.ledgerRows.mockResolvedValue([]);
});

describe("Stripe webhook fulfilment", () => {
  it("does not grant a completed session whose payment is still pending", async () => {
    const response = await deliver({
      type: "checkout.session.completed",
      data: { object: session({ payment_status: "unpaid" }) },
    });
    await expect(response.json()).resolves.toMatchObject({ ignored: "payment not settled" });
    expect(mocks.grantCredits).not.toHaveBeenCalled();
  });

  it("grants a delayed payment once it settles, keyed on the same session id", async () => {
    await deliver({
      type: "checkout.session.async_payment_succeeded",
      data: { object: session() },
    });
    expect(mocks.grantCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", credits: 66, externalRef: "cs_test_1" }),
    );
  });
});

describe("Stripe webhook disputes", () => {
  const dispute = {
    id: "dp_1",
    amount: 6000,
    charge: "ch_1",
    status: "needs_response",
  };

  it("claws back a chargeback at face value, idempotently per dispute", async () => {
    mocks.retrieveCharge.mockResolvedValue({ id: "ch_1", metadata: { userId: "user-1" } });
    await deliver({ type: "charge.dispute.created", data: { object: dispute } });
    expect(mocks.grantCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        credits: -60,
        externalRef: "dispute:dp_1",
        kind: "refund",
        usdPaid: -60,
      }),
    );
  });

  it("uses the same ref when an inquiry escalates, so only one debit lands", async () => {
    mocks.retrieveCharge.mockResolvedValue({ id: "ch_1", metadata: { userId: "user-1" } });
    await deliver({
      type: "charge.dispute.funds_withdrawn",
      data: { object: { ...dispute, status: "under_review" } },
    });
    expect(mocks.grantCredits).toHaveBeenCalledWith(
      expect.objectContaining({ externalRef: "dispute:dp_1" }),
    );
  });

  it("ignores inquiries, which move no money", async () => {
    await deliver({
      type: "charge.dispute.created",
      data: { object: { ...dispute, status: "warning_needs_response" } },
    });
    expect(mocks.retrieveCharge).not.toHaveBeenCalled();
    expect(mocks.grantCredits).not.toHaveBeenCalled();
  });

  it("restores credits only for a won dispute that actually debited them", async () => {
    await deliver({
      type: "charge.dispute.closed",
      data: { object: { ...dispute, status: "won" } },
    });
    expect(mocks.grantCredits).not.toHaveBeenCalled();

    mocks.ledgerRows.mockResolvedValue([{ userId: "user-1", usdPaid: "-60.00" }]);
    await deliver({
      type: "charge.dispute.closed",
      data: { object: { ...dispute, status: "won" } },
    });
    expect(mocks.grantCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", credits: 60, externalRef: "dispute-won:dp_1" }),
    );
  });

  it("keeps the debit when the dispute is lost", async () => {
    mocks.ledgerRows.mockResolvedValue([{ userId: "user-1", usdPaid: "-60.00" }]);
    await deliver({
      type: "charge.dispute.closed",
      data: { object: { ...dispute, status: "lost" } },
    });
    expect(mocks.grantCredits).not.toHaveBeenCalled();
  });
});

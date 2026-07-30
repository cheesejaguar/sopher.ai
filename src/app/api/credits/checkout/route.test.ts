import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCheckout: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ userId: "user_checkout" })),
  assertNotSuspended: vi.fn(async () => undefined),
  UnauthorizedError: class UnauthorizedError extends Error {},
  SuspendedError: class SuspendedError extends Error {},
}));

vi.mock("@/lib/security/rate-limit", () => ({
  LIMITS: { checkout: {} },
  rateLimit: vi.fn(async () => ({ limited: false })),
}));

vi.mock("@/lib/payments/stripe", () => ({
  stripeConfigured: true,
  getStripe: () => ({ checkout: { sessions: { create: mocks.createCheckout } } }),
}));

import { POST } from "./route";

afterEach(() => {
  mocks.createCheckout.mockReset();
  vi.unstubAllEnvs();
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.VERCEL_URL;
});

describe("credit checkout continuation", () => {
  it("preserves a validated full-book continuation through success and cancellation", async () => {
    mocks.createCheckout.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
    process.env.VERCEL_URL = "preview.sopher.test";

    const response = await POST(
      new Request("https://preview.sopher.test/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "preview.sopher.test" },
        body: JSON.stringify({ packId: "starter", returnTo: "/studio/new" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url:
          "https://preview.sopher.test/studio/credits?purchase=complete&return=%2Fstudio%2Fnew",
        cancel_url:
          "https://preview.sopher.test/studio/credits?purchase=cancelled&return=%2Fstudio%2Fnew",
      }),
    );
  });

  it("rejects an off-site continuation before creating a Stripe session", async () => {
    const response = await POST(
      new Request("https://preview.sopher.test/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "preview.sopher.test" },
        body: JSON.stringify({ packId: "starter", returnTo: "https://attacker.test" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("never trusts a request Host header for Stripe return URLs", async () => {
    mocks.createCheckout.mockResolvedValue({ url: "https://checkout.stripe.test/session" });

    const response = await POST(
      new Request("https://attacker.test/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "attacker.test" },
        body: JSON.stringify({ packId: "starter", returnTo: "/studio/new" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://sopher.ai/studio/credits?purchase=complete&return=%2Fstudio%2Fnew",
        cancel_url: "https://sopher.ai/studio/credits?purchase=cancelled&return=%2Fstudio%2Fnew",
      }),
    );
  });

  it("does not trust a loopback request origin in production", async () => {
    mocks.createCheckout.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST(
      new Request("http://localhost:3000/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "localhost:3000" },
        body: JSON.stringify({ packId: "starter" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://sopher.ai/studio/credits?purchase=complete",
        cancel_url: "https://sopher.ai/studio/credits?purchase=cancelled",
      }),
    );
  });
});

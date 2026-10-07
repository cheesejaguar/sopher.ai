import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirectToSignIn: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: vi.fn() }));
vi.mock("@/lib/clerk", () => ({
  clerkEnabled: true,
  devAuthAllowed: false,
  devAdminAllowed: false,
}));
vi.mock("@/lib/billing/credits", () => ({ grantCredits: vi.fn() }));
vi.mock("@/db", () => ({ getDb: vi.fn(), schema: {} }));

import { requirePageUser } from "./auth";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirectToSignIn.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
  mocks.auth.mockResolvedValue({ userId: null, redirectToSignIn: mocks.redirectToSignIn });
});

describe("requirePageUser", () => {
  it("redirects a signed-out page render to sign-in instead of throwing a 500", async () => {
    await expect(requirePageUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirectToSignIn).toHaveBeenCalledOnce();
  });
});

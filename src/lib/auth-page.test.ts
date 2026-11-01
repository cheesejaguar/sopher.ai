import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  // @/lib/clerk reads these at import time; set them before it loads so the
  // real "Clerk is configured" decision runs instead of a hardcoded stand-in.
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_auth_page");
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("ALLOW_DEV_AUTH", undefined);
  return {
    auth: vi.fn(),
    redirectToSignIn: vi.fn(),
  };
});

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: vi.fn() }));
vi.mock("@/db", () => ({ getDb: vi.fn(), schema: {} }));

import { clerkEnabled, devAuthAllowed } from "./clerk";
import { requirePageUser } from "./auth";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirectToSignIn.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
  mocks.auth.mockResolvedValue({ userId: null, redirectToSignIn: mocks.redirectToSignIn });
});

describe("requirePageUser", () => {
  it("runs with Clerk configured and the shared dev identity disabled", () => {
    expect(clerkEnabled).toBe(true);
    expect(devAuthAllowed).toBe(false);
  });

  it("redirects a signed-out page render to sign-in instead of throwing a 500", async () => {
    await expect(requirePageUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirectToSignIn).toHaveBeenCalledOnce();
  });
});

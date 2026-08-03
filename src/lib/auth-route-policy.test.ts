import { describe, expect, it } from "vitest";

import { hasCompleteClerkConfiguration, isProtectedPath } from "./auth-route-policy";

describe("proxy auth route policy", () => {
  it.each([
    [undefined, undefined],
    ["pk_test_example", undefined],
    [undefined, "sk_test_example"],
    ["", "sk_test_example"],
    ["pk_test_example", ""],
  ])("does not enable Clerk with incomplete configuration", (publishableKey, secretKey) => {
    expect(hasCompleteClerkConfiguration(publishableKey, secretKey)).toBe(false);
  });

  it("enables Clerk only when both server keys are available", () => {
    expect(hasCompleteClerkConfiguration("pk_test_example", "sk_test_example")).toBe(true);
  });

  it.each([
    "/admin",
    "/admin/users",
    "/studio",
    "/studio/new",
    "/projects/project-id/write",
    "/api",
    "/api/credits/checkout",
    "/api/projects/project-id/generate",
    "/api/webhooksevil",
    "/api/estimates-private",
    "/api/estimates/private",
    "/api/events-private",
    "/api/events/private",
    "/api/reader-session/private",
    "/api/reader-sessions",
    "/api/internal/reconcile-runs/private",
    "/api/internal/e2e/start-state",
  ])("protects %s", (pathname) => {
    expect(isProtectedPath(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/pricing",
    "/guides/how-book-generation-works",
    "/api/webhooks/stripe",
    "/api/webhooks/clerk",
    "/api/estimates",
    "/api/events",
    "/api/reader-session",
    "/api/internal/reconcile-runs",
  ])("keeps %s public", (pathname) => {
    expect(isProtectedPath(pathname)).toBe(false);
  });
});

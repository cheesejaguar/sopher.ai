import { describe, expect, it } from "vitest";

import {
  hasBackslashInPath,
  hasCompleteClerkConfiguration,
  isProtectedPath,
} from "./auth-route-policy";

describe("backslash probe guard", () => {
  it.each([
    ["https://sopher.ai/opengraph-image%5C", "/opengraph-image%5C"],
    ["https://sopher.ai/opengraph-image%5c", "/opengraph-image%5c"],
    ["https://sopher.ai/studio%5C..%5Cetc", "/studio%5C..%5Cetc"],
    ["https://sopher.ai/x", "/a\\b"],
  ])("rejects %s", (url, pathname) => {
    expect(hasBackslashInPath(url, pathname)).toBe(true);
  });

  it.each([
    ["https://sopher.ai/opengraph-image", "/opengraph-image"],
    ["https://sopher.ai/studio?q=%5C", "/studio"],
    ["https://sopher.ai/r/abc_DEF-123", "/r/abc_DEF-123"],
  ])("allows %s", (url, pathname) => {
    expect(hasBackslashInPath(url, pathname)).toBe(false);
  });
});

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
    "/api/csp-report/private",
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
    "/api/csp-report",
    "/api/reader-session",
    "/api/internal/reconcile-runs",
  ])("keeps %s public", (pathname) => {
    expect(isProtectedPath(pathname)).toBe(false);
  });
});

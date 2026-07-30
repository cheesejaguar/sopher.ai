import { afterEach, describe, expect, it, vi } from "vitest";

import { isE2ETrialUserId, isE2EWorkflowStubEnabled } from "@/lib/e2e-workflow-stub";

describe("isE2EWorkflowStubEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires an isolated non-production database and the explicit workflow stub", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_DATABASE_ISOLATED", "1");
    vi.stubEnv("E2E_STUB_WORKFLOW", "1");

    expect(isE2EWorkflowStubEnabled()).toBe(true);
    expect(isE2ETrialUserId("e2e-trial-123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isE2ETrialUserId("dev-user")).toBe(false);
  });

  it.each([
    ["production", "1", "1"],
    ["test", "0", "1"],
    ["test", "1", "0"],
  ])("fails closed for NODE_ENV=%s isolated=%s workflow=%s", (nodeEnv, isolated, workflow) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("E2E_DATABASE_ISOLATED", isolated);
    vi.stubEnv("E2E_STUB_WORKFLOW", workflow);

    expect(isE2EWorkflowStubEnabled()).toBe(false);
  });

  it("cannot enable the seam on any Vercel deployment", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_DATABASE_ISOLATED", "1");
    vi.stubEnv("E2E_STUB_WORKFLOW", "1");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(isE2EWorkflowStubEnabled()).toBe(false);
    expect(isE2ETrialUserId("e2e-trial-123e4567-e89b-42d3-a456-426614174000")).toBe(false);
  });
});

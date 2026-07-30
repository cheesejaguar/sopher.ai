import "server-only";

const E2E_TRIAL_USER_PATTERN =
  /^e2e-trial-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Allows DB-backed browser tests to exercise the real start boundary without
 * invoking Vercel Workflow or a model provider.
 *
 * All three conditions are required. In particular, a production build can
 * never enable this path even if the two explicit E2E variables are present.
 */
export function isE2EWorkflowStubEnabled(): boolean {
  return (
    !process.env.VERCEL_ENV &&
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_DATABASE_ISOLATED === "1" &&
    process.env.E2E_STUB_WORKFLOW === "1"
  );
}

/** Exact allowlist for per-test, non-Admin identities in the guarded browser suite. */
export function isE2ETrialUserId(value: string | null | undefined): value is string {
  return isE2EWorkflowStubEnabled() && E2E_TRIAL_USER_PATTERN.test(value ?? "");
}

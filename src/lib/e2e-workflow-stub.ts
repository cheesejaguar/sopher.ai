import "server-only";

const E2E_TRIAL_USER_PATTERN =
  /^e2e-trial-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Allows DB-backed browser tests to exercise the real start boundary without
 * invoking Vercel Workflow or a model provider.
 *
 * Every condition is required. Optimized local acceptance may opt in because
 * browser tests should exercise the production server, but only with the
 * disposable database host, explicit dev auth, and a non-Vercel runtime.
 */
export function isE2EWorkflowStubEnabled(): boolean {
  let databaseHostMatches = false;
  try {
    const allowedHost = process.env.E2E_DATABASE_HOST?.trim();
    databaseHostMatches = Boolean(
      allowedHost &&
      process.env.DATABASE_URL &&
      new URL(process.env.DATABASE_URL).hostname === allowedHost,
    );
  } catch {
    databaseHostMatches = false;
  }

  const runtimeAllowed =
    process.env.NODE_ENV !== "production" ||
    (process.env.E2E_PRODUCTION_SERVER === "1" && process.env.ALLOW_DEV_AUTH === "1");

  return (
    !process.env.VERCEL_ENV &&
    runtimeAllowed &&
    databaseHostMatches &&
    process.env.E2E_DATABASE_ISOLATED === "1" &&
    process.env.E2E_STUB_WORKFLOW === "1"
  );
}

/** Exact allowlist for per-test, non-Admin identities in the guarded browser suite. */
export function isE2ETrialUserId(value: string | null | undefined): value is string {
  return isE2EWorkflowStubEnabled() && E2E_TRIAL_USER_PATTERN.test(value ?? "");
}

// Clerk activates once the Marketplace integration provisions keys.
// Until then the app runs unauthenticated so previews stay reviewable.
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

// Without Clerk keys, the shared dev identity is only allowed as an explicit
// opt-in: local development, or ALLOW_DEV_AUTH=1 (server-only, never NEXT_PUBLIC_).
// Everywhere else, missing keys must fail closed.
//
// The VERCEL_ENV guard is the important half. Dev auth turns src/proxy.ts into
// a no-op AND hands every caller the same shared identity, so a stray
// ALLOW_DEV_AUTH=1 on a preview or production deployment is not a degraded mode
// — it is an open door. Vercel sets VERCEL_ENV on every deployment and never
// locally, so this makes the flag inert anywhere it could do damage.
const isDeployed = Boolean(process.env.VERCEL_ENV);

export const devAuthAllowed =
  !isDeployed &&
  (process.env.NODE_ENV === "development" || process.env.ALLOW_DEV_AUTH === "1");

/**
 * Whether the shared dev identity gets the admin role. Separated from
 * devAuthAllowed so that "run the app without Clerk" and "hand out admin" are
 * two decisions rather than one — the admin surface reads other people's
 * manuscripts and moves credits.
 */
export const devAdminAllowed = devAuthAllowed && process.env.DEV_ADMIN !== "0";

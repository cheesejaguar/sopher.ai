// Clerk activates once the Marketplace integration provisions keys.
// Until then the app runs unauthenticated so previews stay reviewable.
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

// Without Clerk keys, the shared dev identity is only allowed as an explicit
// opt-in: local development, or ALLOW_DEV_AUTH=1 (server-only, never NEXT_PUBLIC_).
// Everywhere else, missing keys must fail closed.
export const devAuthAllowed =
  process.env.NODE_ENV === "development" || process.env.ALLOW_DEV_AUTH === "1";

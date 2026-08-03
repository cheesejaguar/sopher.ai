/**
 * Defense-in-depth auth policy for the request proxy.
 *
 * Protected pages and handlers still authorize at their data boundary. This
 * early gate prevents anonymous requests from reaching them at all, while the
 * deliberately public webhook, quote, and funnel-event endpoints keep working.
 */
function within(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Clerk request middleware requires both halves of the server configuration.
 *
 * The publishable key can be inlined when Next builds the proxy, while the
 * secret remains a runtime value. Treating the public key alone as sufficient
 * makes a build started without its matching secret throw before even public
 * pages can render.
 */
export function hasCompleteClerkConfiguration(
  publishableKey: string | undefined,
  secretKey: string | undefined,
): boolean {
  return Boolean(publishableKey && secretKey);
}

export function isProtectedPath(pathname: string): boolean {
  if (within(pathname, "/admin") || within(pathname, "/studio") || within(pathname, "/projects")) {
    return true;
  }
  if (!within(pathname, "/api")) return false;

  return !(
    within(pathname, "/api/webhooks") ||
    pathname === "/api/estimates" ||
    pathname === "/api/events" ||
    // A reader recipient may not have a Sopher account. This exact endpoint
    // validates the fragment bearer token, rate-limits anonymous attempts, and
    // exchanges it for a path-scoped HttpOnly reader cookie. Adjacent reader
    // APIs remain protected by the default policy.
    pathname === "/api/reader-session" ||
    // Vercel Cron has no Clerk session. This exact handler authenticates with
    // CRON_SECRET using a timing-safe comparison; adjacent internal routes
    // remain behind Clerk.
    pathname === "/api/internal/reconcile-runs"
  );
}

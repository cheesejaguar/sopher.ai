/**
 * Security response headers.
 *
 * Split deliberately into two policies. The enforced CSP carries only
 * directives that cannot break a working page — `frame-ancestors` (the one
 * clickjacking control with no header equivalent now that X-Frame-Options is
 * obsolete), `object-src`, `base-uri`. The full script/style/connect policy
 * ships as Report-Only first, because Next 16 with `cacheComponents` prerenders
 * shells that a per-request nonce cannot reach, so the honest first step is to
 * collect violations rather than guess and take the studio down.
 *
 * Flip `CSP_MODE` to "enforce" once a production cycle has produced no
 * unexpected reports.
 */

const CSP_MODE: "report-only" | "enforce" = "report-only";

/** Clerk, Stripe, GA, Vercel Analytics, and our own blob store. */
const CLERK = ["https://*.clerk.accounts.dev", "https://clerk.sopher.ai", "https://*.clerk.com"];
const STRIPE = ["https://js.stripe.com", "https://api.stripe.com", "https://hooks.stripe.com"];
const GOOGLE = ["https://www.googletagmanager.com", "https://*.google-analytics.com"];
const VERCEL = ["https://va.vercel-scripts.com", "https://vitals.vercel-insights.com"];
const BLOB = ["https://*.public.blob.vercel-storage.com"];

/**
 * `unsafe-inline` in script-src is not an oversight: Next's bootstrap and the
 * GA init snippet are both inline, and nonce propagation is unreliable under
 * cacheComponents. It is the reason the full policy stays Report-Only — the
 * enforced policy below carries no script-src at all, so it never grants
 * anything, and the XSS fix in the markdown renderer is the real control here
 * rather than the CSP.
 */
function fullPolicy(includeUpgrade = true): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${[...CLERK, ...STRIPE, ...GOOGLE, ...VERCEL].join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://img.clerk.com ${[...BLOB, ...GOOGLE].join(" ")}`,
    "font-src 'self' data:",
    `connect-src 'self' ${[...CLERK, ...STRIPE, ...GOOGLE, ...VERCEL, ...BLOB].join(" ")}`,
    `frame-src 'self' ${[...CLERK, ...STRIPE].join(" ")}`,
    "worker-src 'self' blob:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    ...(includeUpgrade ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Directives safe to enforce today — none of them can break a working page. */
const ENFORCED_CSP = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'";

export function securityHeaders(): { key: string; value: string }[] {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(self)",
    },
  ];

  // One Content-Security-Policy header, never two — a browser intersects
  // multiple policies, so a second one is a silent way to enforce more than
  // intended. In enforce mode the full policy already contains every directive
  // in ENFORCED_CSP.
  if (CSP_MODE === "enforce") {
    headers.push({ key: "Content-Security-Policy", value: fullPolicy() });
  } else {
    headers.push(
      { key: "Content-Security-Policy", value: ENFORCED_CSP },
      // Browsers ignore upgrade-insecure-requests in report-only mode and log
      // a warning for every page, so omit the no-op directive until enforcement.
      { key: "Content-Security-Policy-Report-Only", value: fullPolicy(false) },
    );
  }

  return headers;
}

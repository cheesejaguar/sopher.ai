import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { devAuthAllowed } from "@/lib/clerk";
import { hasCompleteClerkConfiguration, isProtectedPath } from "@/lib/auth-route-policy";
import {
  ANON_COOKIE,
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
  isEmptyAttribution,
  isReaderPath,
  readAttribution,
} from "@/lib/analytics/attribution";

// Deny by default. The previous enumeration listed API routes one by one, which
// meant every new route was unprotected until someone remembered to add it —
// /api/credits/checkout, /api/projects/*/generate, /api/projects/*/cover,
// /api/entities/*/portrait and /api/assets/diagram had all fallen through that
// way. Inverting it makes forgetting fail safe instead of open.
//
// Carve-outs: webhooks authenticate by signature (Stripe, svix), estimates
// quotes prices before sign-in, and events records the pre-signup funnel —
// which is most of the funnel.
const hasClerkKeys = hasCompleteClerkConfiguration(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  process.env.CLERK_SECRET_KEY,
);

/**
 * Stamps the first-touch attribution and anonymous id cookies.
 *
 * Middleware is the only place this works: it is the first code to see the
 * landing request, before any redirect to sign-in has thrown away the utm
 * parameters. Both cookies are set once and never refreshed — first-touch is
 * the point, and rewriting on every visit would turn it into last-touch.
 *
 * Not set on API or asset requests; those are never a landing page and would
 * only mint cookies for crawlers.
 */
function stampAttribution(req: NextRequest, res: NextResponse): NextResponse {
  if (req.nextUrl.pathname.startsWith("/api/") || isReaderPath(req.nextUrl.pathname)) return res;

  if (!req.cookies.get(ANON_COOKIE)) {
    res.cookies.set(ANON_COOKIE, crypto.randomUUID(), {
      maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
      sameSite: "lax",
      httpOnly: false,
      secure: true,
      path: "/",
    });
  }

  if (!req.cookies.get(ATTRIBUTION_COOKIE)) {
    const attribution = readAttribution(req.nextUrl, req.headers.get("referer"));
    // A direct visit with no campaign and no referrer carries no information;
    // leaving the cookie unset means a later campaign click can still be the
    // first *meaningful* touch.
    if (!isEmptyAttribution(attribution)) {
      res.cookies.set(ATTRIBUTION_COOKIE, encodeURIComponent(JSON.stringify(attribution)), {
        maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
        sameSite: "lax",
        httpOnly: true,
        secure: true,
        path: "/",
      });
    }
  }

  return res;
}

/** Reader recipients never need Clerk, including for the fragment exchange. */
export function isAnonymousReaderRequest(pathname: string): boolean {
  return isReaderPath(pathname) || pathname === "/api/reader-session";
}

// Without Clerk keys: pass through only when dev auth is explicitly allowed
// (development or ALLOW_DEV_AUTH=1); otherwise fail closed on protected routes.
const clerkProxy = clerkMiddleware(async (auth, req) => {
  if (isProtectedPath(req.nextUrl.pathname)) {
    // Returning the redirect/404 unmodified — a visitor being sent to
    // sign-in has not landed yet, and their utm parameters survive on the
    // redirect_url for the page they eventually reach.
    await auth.protect();
  }
  return stampAttribution(req, NextResponse.next());
});

const selectedProxy = hasClerkKeys
  ? clerkProxy
  : devAuthAllowed
    ? function proxy(req: NextRequest) {
        return stampAttribution(req, NextResponse.next());
      }
    : function proxy(req: NextRequest) {
        if (isProtectedPath(req.nextUrl.pathname)) {
          return new Response("Auth misconfigured", { status: 503 });
        }
        return stampAttribution(req, NextResponse.next());
      };

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (isAnonymousReaderRequest(req.nextUrl.pathname)) return NextResponse.next();
  return selectedProxy(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|\\.well-known|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

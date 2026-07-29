import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { devAuthAllowed } from "@/lib/clerk";

// Deny by default. The previous enumeration listed API routes one by one, which
// meant every new route was unprotected until someone remembered to add it —
// /api/credits/checkout, /api/projects/*/generate, /api/projects/*/cover,
// /api/entities/*/portrait and /api/assets/diagram had all fallen through that
// way. Inverting it makes forgetting fail safe instead of open.
//
// Webhooks authenticate by signature (Stripe, svix) and estimates is
// deliberately public, so those two are the only carve-outs.
const isProtected = createRouteMatcher([
  "/admin(.*)",
  "/studio(.*)",
  "/projects(.*)",
  "/api/((?!webhooks|estimates).*)",
]);

const hasClerkKeys = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

// Without Clerk keys: pass through only when dev auth is explicitly allowed
// (development or ALLOW_DEV_AUTH=1); otherwise fail closed on protected routes.
export default hasClerkKeys
  ? clerkMiddleware(async (auth, req) => {
      if (isProtected(req)) await auth.protect();
    })
  : devAuthAllowed
    ? function proxy() {}
    : function proxy(req: NextRequest) {
        if (isProtected(req)) return new Response("Auth misconfigured", { status: 503 });
      };

export const config = {
  matcher: [
    "/((?!_next|\\.well-known|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { devAuthAllowed } from "@/lib/clerk";

const isProtected = createRouteMatcher([
  "/studio(.*)",
  "/projects(.*)",
  "/api/usage(.*)",
  "/api/runs(.*)",
  "/api/chapters(.*)",
  "/api/content-tools(.*)",
  "/api/export(.*)",
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

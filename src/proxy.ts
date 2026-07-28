import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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

// Until the Clerk integration is provisioned, pass requests through so previews stay usable.
export default hasClerkKeys
  ? clerkMiddleware(async (auth, req) => {
      if (isProtected(req)) await auth.protect();
    })
  : function proxy() {};

export const config = {
  matcher: [
    "/((?!_next|\\.well-known|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

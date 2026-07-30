import { Suspense } from "react";
import { connection } from "next/server";
import { SignIn } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk";
import { AuthPending } from "@/components/auth-pending";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthShell } from "../../auth-shell";

export const metadata = {
  title: "Sign in",
  // Thin, duplicated-by-Clerk, and useless as a landing page — but public, so
  // without this it competes with the homepage for brand queries.
  robots: { index: false, follow: true },
};

export default async function SignInPage() {
  // Clerk's optional catch-all route depends on the incoming auth request.
  await connection();

  return (
    <AuthShell
      mode="Sign in"
      title="Return to your manuscript."
      description="Open your library, continue a draft, or review the latest editorial pass. Your projects stay private to your account."
    >
      {clerkEnabled ? (
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-sm" />}>
          <SignIn
            appearance={{
              elements: {
                rootBox: "w-full min-w-0 max-w-full",
                cardBox: "w-full min-w-0 max-w-full shadow-none",
                card: "w-full min-w-0 max-w-full rounded-sm border border-border shadow-none",
                headerTitle: "hidden",
              },
            }}
          />
        </Suspense>
      ) : (
        <AuthPending />
      )}
    </AuthShell>
  );
}

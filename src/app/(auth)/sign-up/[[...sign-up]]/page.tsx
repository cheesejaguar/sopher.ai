import { Suspense } from "react";
import { connection } from "next/server";
import { SignUp } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk";
import { AuthPending } from "@/components/auth-pending";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthShell } from "../../auth-shell";

export const metadata = {
  title: "Create account",
  // Thin, duplicated-by-Clerk, and useless as a landing page — but public, so
  // without this it competes with the homepage for brand queries.
  robots: { index: false, follow: true },
};

export default async function SignUpPage() {
  // Clerk's optional catch-all route depends on the incoming auth request.
  await connection();

  return (
    <AuthShell
      mode="Create account"
      title="Begin with one sentence."
      description="Bring the idea, memory, or story you have been carrying. The five-stage workflow will make the path to a finished manuscript visible."
    >
      {clerkEnabled ? (
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-sm" />}>
          <SignUp
            appearance={{
              elements: {
                rootBox: "w-full",
                cardBox: "w-full shadow-none",
                card: "w-full rounded-sm border border-border shadow-none",
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

import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk";
import { AuthPending } from "@/components/auth-pending";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center p-6 outline-none"
    >
      {clerkEnabled ? (
        <Suspense fallback={<Skeleton className="h-96 w-96 max-w-full rounded-xl" />}>
          <SignIn />
        </Suspense>
      ) : (
        <AuthPending />
      )}
    </main>
  );
}

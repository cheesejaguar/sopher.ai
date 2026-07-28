import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk";
import { AuthPending } from "@/components/auth-pending";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center p-6 outline-none"
    >
      {clerkEnabled ? (
        <Suspense fallback={<Skeleton className="h-96 w-96 max-w-full rounded-xl" />}>
          <SignUp />
        </Suspense>
      ) : (
        <AuthPending />
      )}
    </main>
  );
}

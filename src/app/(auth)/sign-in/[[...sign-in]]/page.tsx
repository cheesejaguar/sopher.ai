import { SignIn } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk";
import { AuthPending } from "@/components/auth-pending";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      {clerkEnabled ? <SignIn /> : <AuthPending />}
    </main>
  );
}

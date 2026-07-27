import { SignUp } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk";
import { AuthPending } from "@/components/auth-pending";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      {clerkEnabled ? <SignUp /> : <AuthPending />}
    </main>
  );
}

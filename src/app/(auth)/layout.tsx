import type { ReactNode } from "react";
import { Suspense } from "react";

import { ClerkRouteProvider } from "@/components/auth/clerk-route-provider";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          tabIndex={-1}
          role="status"
          aria-label="Loading account access"
          className="instrument-canvas grid min-h-dvh place-items-center px-6 outline-none"
        >
          <div className="instrument-surface-raised w-full max-w-sm p-6">
            <p className="folio-label text-primary">Account desk / secure access</p>
            <div className="mt-5 h-px w-full bg-border" aria-hidden="true" />
            <p className="mt-5 text-sm text-muted-foreground">Preparing secure sign-in…</p>
          </div>
        </main>
      }
    >
      <ClerkRouteProvider>{children}</ClerkRouteProvider>
    </Suspense>
  );
}

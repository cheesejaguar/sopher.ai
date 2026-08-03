import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import StudioLoading from "./loading";
import { ClerkRouteProvider } from "@/components/auth/clerk-route-provider";
import { ProductShell } from "@/components/studio/product-shell";
import { getBalance } from "@/lib/billing/credits";
import { requireUser } from "@/lib/auth";
import { getStudioAccess } from "@/lib/studio-access";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          tabIndex={-1}
          role="status"
          aria-label="Loading studio"
          className="outline-none"
        >
          <StudioLoading />
        </main>
      }
    >
      <StudioShell>{children}</StudioShell>
    </Suspense>
  );
}

async function StudioShell({ children }: { children: React.ReactNode }) {
  // Every Studio surface is user-specific. Waiting for the request keeps
  // private data and auth checks out of the public prerender while retaining
  // streaming boundaries for the shell and page content.
  await connection();
  const { userId } = await requireUser();
  const [credits, access] = await Promise.all([getBalance(userId), getStudioAccess(userId)]);
  const publicCredits = access.fullBookUnlocked ? credits : undefined;
  const creditLabel =
    access.trialProjectId || access.creationExperience === "trial_short_story"
      ? "Story included"
      : access.reason === "verify_email"
        ? "Verify first"
        : "Unlock";

  return (
    <ClerkRouteProvider>
      <ProductShell credits={publicCredits} creditLabel={creditLabel}>
        <Suspense fallback={<StudioLoading />}>{children}</Suspense>
      </ProductShell>
    </ClerkRouteProvider>
  );
}

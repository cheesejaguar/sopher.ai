import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/auth";
import { ClerkRouteProvider } from "@/components/auth/clerk-route-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductShell } from "@/components/studio/product-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

/**
 * The admin shell. requireAdmin() failing renders a plain 404 — the surface's
 * existence is not advertised to non-admins. The guard is an uncached DB read,
 * so with cacheComponents the ENTIRE shell (nav included — nothing may leak
 * into static HTML) renders inside the Suspense boundary around it.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Admin is both authorization- and data-dependent; never evaluate it during
  // the public build or include any part of it in a static shell.
  await connection();

  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-7xl space-y-4 px-6 py-8">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <GuardedShell>{children}</GuardedShell>
    </Suspense>
  );
}

async function GuardedShell({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  return (
    <ClerkRouteProvider>
      <ProductShell variant="admin">
        <Suspense
          fallback={
            <div role="status" aria-label="Loading admin workspace" className="space-y-4">
              <span className="sr-only">Loading admin workspace</span>
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          }
        >
          {children}
        </Suspense>
      </ProductShell>
    </ClerkRouteProvider>
  );
}

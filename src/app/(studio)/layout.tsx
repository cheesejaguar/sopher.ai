import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import StudioLoading from "./loading";
import { ProductShell } from "@/components/studio/product-shell";
import { getBalance } from "@/lib/billing/credits";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  // Every Studio surface is user-specific. Waiting for the request keeps
  // private data and auth checks out of the public prerender while retaining
  // streaming boundaries for the shell and page content.
  await connection();
  const { userId } = await requireUser();
  const credits = await getBalance(userId);

  return (
    <ProductShell credits={credits}>
      <Suspense fallback={<StudioLoading />}>{children}</Suspense>
    </ProductShell>
  );
}

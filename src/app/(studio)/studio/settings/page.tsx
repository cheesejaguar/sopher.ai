import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getBalance } from "@/lib/billing/credits";
import { requireUser } from "@/lib/auth";
import Link from "next/link";

import { AppearanceCard, DefaultsCard } from "./settings-cards";

export const metadata: Metadata = {
  title: "Settings",
};

async function CreditsSection() {
  const { userId } = await requireUser();
  const balance = await getBalance(userId);
  return (
    <Card>
      <CardHeader>
        <h2 className="font-sans text-base font-semibold">Credits</h2>
        <p className="text-sm text-muted-foreground">
          Your prepaid balance is the spending limit — work stops (and can be resumed) when it runs
          out, so there is no separate monthly cap to manage.
        </p>
      </CardHeader>
      <CardContent className="flex items-baseline justify-between gap-4">
        <p className="font-display text-2xl font-semibold tabular-nums">
          {balance.toFixed(2)}
          <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">credits</span>
        </p>
        <Link href="/studio/credits" className="text-sm font-medium text-primary hover:underline">
          Buy credits
        </Link>
      </CardContent>
    </Card>
  );
}

function CreditsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-8 w-56" />
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          How the studio looks and what new books assume.
        </p>
      </header>

      <div className="space-y-6">
        <AppearanceCard />
        <DefaultsCard />
        <Suspense fallback={<CreditsSkeleton />}>
          <CreditsSection />
        </Suspense>
      </div>
    </div>
  );
}

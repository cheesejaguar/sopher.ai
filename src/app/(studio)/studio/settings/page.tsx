import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getBalance } from "@/lib/billing/credits";
import { requireUser } from "@/lib/auth";
import Link from "next/link";

import { AppearanceCard, DefaultsCard } from "./settings-cards";
import { CostDisplay, PageHeader } from "@/components/studio/product-primitives";

export const metadata: Metadata = {
  title: "Settings",
};

async function CreditsSection() {
  const { userId } = await requireUser();
  const balance = await getBalance(userId);
  return (
    <Card className="instrument-surface rounded-sm">
      <CardHeader>
        <h2 className="font-sans text-base font-semibold">Credits</h2>
        <p className="text-sm text-muted-foreground">
          Your prepaid balance is the spending limit — work stops (and can be resumed) when it runs
          out, so there is no separate monthly cap to manage.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end justify-between gap-4">
        <CostDisplay credits={balance} label="Available balance" />
        <Link href="/studio/credits" className="text-sm font-medium text-primary hover:underline">
          Buy credits
        </Link>
      </CardContent>
    </Card>
  );
}

function CreditsSkeleton() {
  return (
    <Card className="instrument-surface rounded-sm">
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
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        label="Account / Settings"
        title="Settings"
        description="Choose how the studio looks and what each new book assumes."
      />

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

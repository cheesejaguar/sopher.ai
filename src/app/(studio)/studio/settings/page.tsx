import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getBudget, getMonthToDateSpend } from "@/lib/billing/meter";
import { requireUser } from "@/lib/auth";
import { AppearanceCard, BudgetCard, DefaultsCard } from "./settings-cards";

export const metadata: Metadata = {
  title: "Settings",
};

async function BudgetSection() {
  const { userId } = await requireUser();
  const [budget, spentUsd] = await Promise.all([getBudget(userId), getMonthToDateSpend(userId)]);
  return <BudgetCard monthlyLimitUsd={budget.monthlyLimitUsd} spentUsd={spentUsd} />;
}

function BudgetSkeleton() {
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
        <Suspense fallback={<BudgetSkeleton />}>
          <BudgetSection />
        </Suspense>
      </div>
    </div>
  );
}

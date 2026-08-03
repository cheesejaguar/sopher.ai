import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getBalance } from "@/lib/billing/credits";
import { requireUser } from "@/lib/auth";
import Link from "next/link";

import { AppearanceCard, DefaultsCard, NotificationPreferencesCard } from "./settings-cards";
import { CostDisplay, PageHeader } from "@/components/studio/product-primitives";
import { getStudioAccess } from "@/lib/studio-access";
import { FULL_BOOK_UNLOCK_HREF } from "@/lib/marketing/trial-offer";
import { getNotificationSettings } from "@/lib/notification-preferences";

export const metadata: Metadata = {
  title: "Settings",
};

async function CreditsSection() {
  const { userId } = await requireUser();
  const [balance, access] = await Promise.all([getBalance(userId), getStudioAccess(userId)]);
  return (
    <Card className="instrument-surface rounded-sm">
      <CardHeader>
        <h2 className="font-sans text-base font-semibold">Credits</h2>
        <p className="text-sm text-muted-foreground">
          {access.fullBookUnlocked
            ? "Your prepaid balance is the spending limit — work stops (and can be resumed) when it runs out, so there is no separate monthly cap to manage."
            : "The included story uses a private production allowance rather than a public credit balance. One purchase unlocks full-length production."}
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end justify-between gap-4">
        {access.fullBookUnlocked ? (
          <CostDisplay credits={balance} label="Available balance" />
        ) : (
          <div>
            <p className="folio-label text-muted-foreground">Included experience</p>
            <p className="mt-1 text-lg font-semibold">
              {access.trialProjectId ? "Short story covered" : "Full-length books locked"}
            </p>
          </div>
        )}
        <Link
          href={access.fullBookUnlocked ? "/studio/credits" : FULL_BOOK_UNLOCK_HREF}
          className="text-sm font-medium text-primary hover:underline"
        >
          {access.fullBookUnlocked ? "Buy credits" : "Unlock full-length books"}
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

async function NotificationPreferencesSection() {
  const { userId } = await requireUser();
  const settings = await getNotificationSettings(userId);
  return (
    <NotificationPreferencesCard email={settings.email} initialPreferences={settings.preferences} />
  );
}

function NotificationPreferencesSkeleton() {
  return (
    <Card className="instrument-surface rounded-sm">
      <CardHeader>
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Settings"
        description="Choose how the studio looks, what each new book assumes, and when Sopher emails you."
      />

      <div className="space-y-6">
        <AppearanceCard />
        <DefaultsCard />
        <Suspense fallback={<NotificationPreferencesSkeleton />}>
          <NotificationPreferencesSection />
        </Suspense>
        <Suspense fallback={<CreditsSkeleton />}>
          <CreditsSection />
        </Suspense>
      </div>
    </div>
  );
}

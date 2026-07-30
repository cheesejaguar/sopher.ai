import Link from "next/link";
import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCredits, formatUsd } from "@/components/usage/format";
import { getOverviewKpis } from "@/db/queries/admin";
import { CREDIT_MARKUP } from "@/lib/billing/credits-shared";
import { PageHeader } from "@/components/studio/product-primitives";

export const metadata = { title: "Admin" };

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="instrument-surface gap-2 rounded-sm py-4 sm:gap-3 sm:py-5">
      <CardHeader className="px-4 pb-0 sm:px-5">
        <CardTitle className="font-mono text-[0.68rem] font-normal tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 sm:px-5">
        <p className="font-display text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
        {note ? (
          <p className="mt-1 text-[0.6875rem] leading-4 text-pretty text-muted-foreground sm:text-xs">
            {note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

async function Kpis() {
  const kpis = await getOverviewKpis();
  const revenueUsd = kpis.money.revenueUsd; // purchases at face value
  const cogs = kpis.money.cogsUsd;
  const margin = revenueUsd > 0 ? ((revenueUsd - cogs) / revenueUsd) * 100 : null;

  return (
    <>
      <div className="grid gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Kpi
          label="Users"
          value={String(kpis.users.total)}
          note={`${kpis.users.new7d} new this week${kpis.users.suspended ? ` · ${kpis.users.suspended} suspended` : ""}`}
        />
        <Kpi
          label="Books"
          value={String(kpis.books.total)}
          note={`${kpis.books.completed7d} completed this week · ${Number(kpis.books.words).toLocaleString()} words total`}
        />
        <Kpi label="Revenue" value={formatUsd(revenueUsd)} note="credit purchases at face value" />
        <Kpi
          label="Metered COGS"
          value={formatUsd(cogs)}
          note={margin !== null ? `${margin.toFixed(1)}% gross margin` : "no revenue yet"}
        />
        <Kpi
          label="Credit liability"
          value={formatCredits(kpis.money.liabilityCredits)}
          note={`≈ ${formatUsd(kpis.money.liabilityCredits / CREDIT_MARKUP)} of work owed`}
        />
        <Kpi
          label="Granted credits"
          value={formatCredits(kpis.money.grantedCredits)}
          note="welcome grants + adjustments"
        />
        <Kpi
          label="Runs"
          value={String(kpis.runs.active)}
          note={`active now · ${kpis.runs.failed7d} failed this week`}
        />
        <Kpi label="Open flags" value={String(kpis.flags.open)} note="moderation queue" />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <a
          className="text-primary hover:underline"
          href="https://analytics.google.com/analytics/web/"
        >
          Google Analytics →
        </a>
        <a
          className="text-primary hover:underline"
          href="https://vercel.com/cheesejaguar-2353s-projects/sopher-ai/analytics"
        >
          Vercel Analytics →
        </a>
        <a className="text-primary hover:underline" href="https://dashboard.stripe.com">
          Stripe →
        </a>
        <Link className="text-primary hover:underline" href="/admin/runs">
          Debug runs →
        </Link>
      </div>
    </>
  );
}

export default function AdminOverview() {
  return (
    <div className="space-y-6">
      <PageHeader
        label="Admin / Control room"
        title="Overview"
        description="Operational, financial, and moderation state across the writing system."
      />
      <Suspense
        fallback={
          <div className="grid gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-sm sm:h-28" />
            ))}
          </div>
        }
      >
        <Kpis />
      </Suspense>
    </div>
  );
}

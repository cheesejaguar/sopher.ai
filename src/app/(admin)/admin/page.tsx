import Link from "next/link";
import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCredits, formatUsd } from "@/components/usage/format";
import { getOverviewKpis } from "@/db/queries/admin";
import { CREDIT_MARKUP } from "@/lib/billing/credits-shared";

export const metadata = { title: "Admin — sopher.ai" };

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="font-mono text-[0.68rem] font-normal tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
        {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      <h1 className="font-display text-2xl font-semibold tracking-tight">Overview</h1>
      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        }
      >
        <Kpis />
      </Suspense>
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SpendTable } from "@/components/studio/spend-table";
import Link from "next/link";

import { formatCredits, formatUsd } from "@/components/usage/format";
import { RoleTable } from "@/components/usage/role-table";
import { requireUser } from "@/lib/auth";
import { getMonthToDateSpend } from "@/lib/billing/meter";
import { CREDIT_MARKUP, getBalance } from "@/lib/billing/credits";
import { getSpendByProject, getSpendByRole } from "@/db/queries/books";

export const metadata: Metadata = {
  title: "Usage",
};

function monthStartUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function WalletCard() {
  const { userId } = await requireUser();
  const [spentUsd, balance] = await Promise.all([getMonthToDateSpend(userId), getBalance(userId)]);
  const spentCredits = spentUsd * CREDIT_MARKUP;
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date());

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Credits
        </CardTitle>
        <CardDescription>
          Your prepaid balance is the spending limit — writing pauses when it runs out and resumes
          after a top-up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-mono text-2xl tabular-nums">
          <span className={balance <= 0 ? "text-ember" : undefined}>{formatCredits(balance)}</span>{" "}
          <span className="text-sm text-muted-foreground">available</span>
        </p>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatCredits(spentCredits)} used in {monthName} ({formatUsd(spentUsd)} metered)
        </p>
        <Link
          href="/studio/credits"
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          Buy credits or view the ledger
        </Link>
      </CardContent>
    </Card>
  );
}

async function ProjectSpendCard() {
  const { userId } = await requireUser();
  const rows = await getSpendByProject(userId, monthStartUtc());
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Spend by book
        </CardTitle>
        <CardDescription>Month to date, across generation and editing runs.</CardDescription>
      </CardHeader>
      <CardContent>
        <SpendTable rows={rows.map((r) => ({ ...r, usd: Number(r.usd) }))} />
      </CardContent>
    </Card>
  );
}

async function RoleSpendCard() {
  const { userId } = await requireUser();
  const rows = await getSpendByRole(userId, undefined, monthStartUtc());
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Spend by role
        </CardTitle>
        <CardDescription>
          Which agents and models the money went to. Cached input tokens are billed at a tenth of
          the input rate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RoleTable
          rows={rows.map((r) => ({
            agentRole: r.agentRole,
            model: r.model,
            calls: r.calls,
            inputTokens: Number(r.inputTokens),
            outputTokens: Number(r.outputTokens),
            cachedInputTokens: Number(r.cachedInputTokens),
            usd: Number(r.usd),
          }))}
        />
      </CardContent>
    </Card>
  );
}

function CardSkeleton({ lines }: { lines: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export default function UsagePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Usage</h1>
        <p className="text-sm text-muted-foreground">What generation has cost, book by book.</p>
      </header>

      <Suspense fallback={<CardSkeleton lines={3} />}>
        <WalletCard />
      </Suspense>

      <Suspense fallback={<CardSkeleton lines={4} />}>
        <ProjectSpendCard />
      </Suspense>

      <Suspense fallback={<CardSkeleton lines={5} />}>
        <RoleSpendCard />
      </Suspense>

      <p className="text-xs text-muted-foreground">
        Costs are metered per model call and update live during generation.
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SpendTable } from "@/components/studio/spend-table";
import { BudgetBar } from "@/components/usage/budget-bar";
import { formatUsd } from "@/components/usage/format";
import { RoleTable } from "@/components/usage/role-table";
import { requireUser } from "@/lib/auth";
import { getBudget, getMonthToDateSpend } from "@/lib/billing/meter";
import { getSpendByProject, getSpendByRole } from "@/db/queries/books";

export const metadata: Metadata = {
  title: "Usage",
};

function monthStartUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function BudgetCard() {
  const { userId } = await requireUser();
  const [spent, budget] = await Promise.all([getMonthToDateSpend(userId), getBudget(userId)]);
  const usedPct = budget.monthlyLimitUsd > 0 ? (spent / budget.monthlyLimitUsd) * 100 : 100;
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date());

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {monthName} budget
        </CardTitle>
        <CardDescription>
          Resets on the 1st.{" "}
          {budget.hardLimit ? "Generation pauses at the cap." : "Soft cap — generation continues."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-mono text-2xl tabular-nums">
          <span className="text-ember">{formatUsd(spent)}</span>{" "}
          <span className="text-sm text-muted-foreground">
            of {formatUsd(budget.monthlyLimitUsd)}
          </span>
        </p>
        <BudgetBar pct={usedPct} warnAtPct={budget.alertThresholdPct} />
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {Math.round(usedPct)}% used · {formatUsd(Math.max(0, budget.monthlyLimitUsd - spent))}{" "}
          remaining
        </p>
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
        <BudgetCard />
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

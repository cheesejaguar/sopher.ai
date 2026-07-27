import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SpendTable } from "@/components/studio/spend-table";
import {
  formatUsd,
  MONTHLY_BUDGET_USD,
  MONTHLY_SPEND_USD,
  sampleProjects,
} from "@/lib/placeholder-data";

export const metadata: Metadata = {
  title: "Usage",
};

export default function UsagePage() {
  const usedPct = (MONTHLY_SPEND_USD / MONTHLY_BUDGET_USD) * 100;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Usage</h1>
        <p className="text-sm text-muted-foreground">What generation has cost, book by book.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>July budget</CardTitle>
          <CardDescription>Resets on the 1st. Generation pauses at the cap.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="font-mono text-2xl tabular-nums">
            <span className="text-ember">{formatUsd(MONTHLY_SPEND_USD)}</span>{" "}
            <span className="text-sm text-muted-foreground">
              of {formatUsd(MONTHLY_BUDGET_USD)}
            </span>
          </p>
          <Progress value={usedPct} aria-label="Monthly budget used" />
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {Math.round(usedPct)}% used · {formatUsd(MONTHLY_BUDGET_USD - MONTHLY_SPEND_USD)}{" "}
            remaining
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spend by book</CardTitle>
          <CardDescription>All-time, across every generation and editing run.</CardDescription>
        </CardHeader>
        <CardContent>
          <SpendTable projects={sampleProjects} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Costs are metered per model call and update live during generation.
      </p>
    </div>
  );
}

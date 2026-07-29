import { Suspense } from "react";
import { notFound } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { EstimateReceipt } from "@/components/usage/estimate-receipt";
import { formatCredits } from "@/components/usage/format";
import { CREDIT_MARKUP } from "@/lib/billing/credits";
import { RoleTable } from "@/components/usage/role-table";
import { estimateBookCost } from "@/ai/estimate";
import { requireUser } from "@/lib/auth";
import { getProjectSpend, getProjectWithBook, getSpendByRole } from "@/db/queries/books";

async function ProjectUsage({ projectId }: { projectId: string }) {
  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  if (!data) notFound();
  const { project } = data;

  const [spend, byRole] = await Promise.all([
    getProjectSpend(projectId),
    getSpendByRole(userId, projectId),
  ]);
  const estimate = estimateBookCost(
    project.settings.qualityTier ?? "standard",
    project.targetChapters,
    project.targetWordsPerChapter,
  );

  return (
    <>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold tracking-tight">Usage</h2>
        <p className="font-mono text-sm tabular-nums">
          <span className="text-ember">{formatCredits(spend * CREDIT_MARKUP)}</span>{" "}
          <span className="text-xs text-muted-foreground">
            of ~{formatCredits(estimate.totalUsd * CREDIT_MARKUP)} estimated
          </span>
        </p>
      </header>

      <EstimateReceipt estimate={estimate} actualUsd={spend} />

      <div className="rounded-xl bg-card px-4 py-2 ring-1 ring-foreground/10">
        <RoleTable
          rows={byRole.map((r) => ({
            agentRole: r.agentRole,
            model: r.model,
            calls: r.calls,
            inputTokens: Number(r.inputTokens),
            outputTokens: Number(r.outputTokens),
            cachedInputTokens: Number(r.cachedInputTokens),
            usd: Number(r.usd),
          }))}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Costs are metered per model call and update live during generation. Estimates carry ±30%
        uncertainty.
      </p>
    </>
  );
}

function UsageSkeleton() {
  return (
    <>
      <p role="status" className="sr-only">
        Loading usage…
      </p>
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </>
  );
}

export default async function ProjectUsagePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="space-y-4">
      <Suspense fallback={<UsageSkeleton />}>
        <ProjectUsage projectId={projectId} />
      </Suspense>
    </div>
  );
}

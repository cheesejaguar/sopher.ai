import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CancelRunButton } from "@/components/admin/cancel-run-button";
import { ReconcileMeteringButton } from "@/components/admin/reconcile-metering-button";
import { RelativeTime } from "@/components/relative-time";
import { formatCredits, formatUsd } from "@/components/usage/format";
import { PageHeader } from "@/components/studio/product-primitives";
import { listRuns, listUnresolvedMeteringIntents } from "@/db/queries/admin";

export const metadata = { title: "Runs — admin" };

const ACTIVE = new Set(["queued", "running", "awaiting_input"]);

export default async function AdminRuns() {
  const [runs, unresolvedIntents] = await Promise.all([
    listRuns(),
    listUnresolvedMeteringIntents(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Generation runs"
        description="Database state, Workflow observations, durable progress, and active incidents. Silence is flagged for investigation, never treated as proof of failure."
      />
      <Table aria-label="Recent generation runs" scrollLabel="Recent generation runs">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">When</TableHead>
            <TableHead scope="col">Book</TableHead>
            <TableHead scope="col">User</TableHead>
            <TableHead scope="col">Kind</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Stage</TableHead>
            <TableHead scope="col">Last signal</TableHead>
            <TableHead scope="col" className="text-right">
              Cost
            </TableHead>
            <TableHead scope="col">Error</TableHead>
            <TableHead scope="col">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow
              key={run.id}
              className={run.health === "critical" ? "bg-destructive/5" : undefined}
            >
              <TableCell className="whitespace-nowrap text-muted-foreground">
                <Link href={`/admin/runs/${run.id}`} className="text-primary hover:underline">
                  <RelativeTime iso={run.createdAt.toISOString()} />
                </Link>
              </TableCell>
              <TableCell className="max-w-48 truncate">{run.title}</TableCell>
              <TableCell className="max-w-48 truncate text-muted-foreground">
                <Link href={`/admin/users/${run.userId}`} className="hover:underline">
                  {run.email}
                </Link>
              </TableCell>
              <TableCell>{run.kind}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    run.status === "failed" || run.health === "critical"
                      ? "destructive"
                      : ACTIVE.has(run.status) || run.health === "warning"
                        ? "default"
                        : "outline"
                  }
                >
                  {run.status}
                  {run.cancellationRequestedAt ? " · stopping" : ""}
                  {run.health === "warning" || run.health === "critical" ? ` · ${run.health}` : ""}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="font-medium">{run.currentStage}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground tabular-nums">
                  {run.progressPct}%
                </span>
                {run.pauseKind ? (
                  <span className="mt-1 block text-xs text-ember">
                    {run.pauseKind === "outline_approval"
                      ? "outline review"
                      : run.pauseKind === "creative_decision"
                        ? "story direction"
                        : "credits required"}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {(run.heartbeatAt ?? run.lastEventAt ?? run.lastProgressAt) ? (
                  <RelativeTime
                    iso={new Date(
                      run.heartbeatAt ?? run.lastEventAt ?? run.lastProgressAt!,
                    ).toISOString()}
                  />
                ) : (
                  "No signal"
                )}
                <span className="mt-1 block text-xs">
                  Workflow: {run.workflowStatus ?? (run.workflowRunId ? "unchecked" : "unlinked")}
                </span>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatUsd(run.usd)}
              </TableCell>
              <TableCell
                className="max-w-64 truncate text-muted-foreground"
                title={[run.incidentCategories, run.error].filter(Boolean).join("\n")}
              >
                {run.incidentCategories ?? run.rootErrorCode ?? run.error ?? "—"}
              </TableCell>
              <TableCell>
                {ACTIVE.has(run.status) && !run.cancellationRequestedAt ? (
                  <CancelRunButton runId={run.id} />
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <section className="space-y-3 border-t border-border/70 pt-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Unresolved provider attempts</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            These credit holds remain fail-closed after provider success could not be settled.
            Release one only after its attempt or generation id is verified uncharged in AI Gateway.
          </p>
        </div>
        {unresolvedIntents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unresolved metering intents.</p>
        ) : (
          <Table
            aria-label="Unresolved provider attempts"
            scrollLabel="Unresolved provider attempts"
          >
            <TableHeader>
              <TableRow>
                <TableHead scope="col">When</TableHead>
                <TableHead scope="col">Book</TableHead>
                <TableHead scope="col">User</TableHead>
                <TableHead scope="col">Attempt / generation</TableHead>
                <TableHead scope="col" className="text-right">
                  Held
                </TableHead>
                <TableHead scope="col">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unresolvedIntents.map((intent) => (
                <TableRow key={intent.intentRef}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    <RelativeTime iso={new Date(intent.createdAt).toISOString()} />
                  </TableCell>
                  <TableCell className="max-w-48 truncate">
                    {intent.projectTitle ?? "Interactive tool"}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">
                    <Link href={`/admin/users/${intent.userId}`} className="hover:underline">
                      {intent.email}
                    </Link>
                  </TableCell>
                  <TableCell
                    className="max-w-80 truncate font-mono text-xs text-muted-foreground"
                    title={`${intent.intentRef}\n${intent.description}`}
                  >
                    {intent.description}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatCredits(intent.heldCredits)}
                  </TableCell>
                  <TableCell>
                    <ReconcileMeteringButton intentRef={intent.intentRef} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

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
        label="Admin / Production"
        title="Generation runs"
        description="Stuck means awaiting input for 24h+ or running for 2h+. The event log shows exactly what the author saw."
      />
      <Table aria-label="Recent generation runs" scrollLabel="Recent generation runs">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">When</TableHead>
            <TableHead scope="col">Book</TableHead>
            <TableHead scope="col">User</TableHead>
            <TableHead scope="col">Kind</TableHead>
            <TableHead scope="col">Status</TableHead>
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
            <TableRow key={run.id} className={run.stuck ? "bg-ember/5" : undefined}>
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
                    run.status === "failed" || run.stuck
                      ? "destructive"
                      : ACTIVE.has(run.status)
                        ? "default"
                        : "outline"
                  }
                >
                  {run.status}
                  {run.stuck ? " · stuck" : ""}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatUsd(run.usd)}
              </TableCell>
              <TableCell
                className="max-w-64 truncate text-muted-foreground"
                title={run.error ?? ""}
              >
                {run.error ?? "—"}
              </TableCell>
              <TableCell>
                {ACTIVE.has(run.status) ? <CancelRunButton runId={run.id} /> : null}
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

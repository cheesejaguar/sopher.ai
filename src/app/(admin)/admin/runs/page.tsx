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
import { RelativeTime } from "@/components/relative-time";
import { formatUsd } from "@/components/usage/format";
import { listRuns } from "@/db/queries/admin";

export const metadata = { title: "Runs — admin" };

const ACTIVE = new Set(["queued", "running", "awaiting_input"]);

export default async function AdminRuns() {
  const runs = await listRuns();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Generation runs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stuck = awaiting input for 24h+ or running for 2h+. The event log shows exactly what the
          author saw.
        </p>
      </header>
      <Table aria-label="Recent generation runs">
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
    </div>
  );
}

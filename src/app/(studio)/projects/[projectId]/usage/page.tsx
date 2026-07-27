import { notFound } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUsd, formatWords, getProject, sampleAgentSpend } from "@/lib/placeholder-data";

export default async function ProjectUsagePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  const total = sampleAgentSpend.reduce((sum, row) => sum + row.usd, 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold tracking-tight">Usage</h2>
        <p className="font-mono text-sm tabular-nums">
          <span className="text-ember">{formatUsd(project.spendUsd)}</span>{" "}
          <span className="text-xs text-muted-foreground">
            of ~{formatUsd(project.estimateUsd)} estimated
          </span>
        </p>
      </header>

      <div className="rounded-xl bg-card px-4 py-2 ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead className="hidden md:table-cell">What it did</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleAgentSpend.map((row) => (
              <TableRow key={row.agent}>
                <TableCell className="font-medium">{row.agent}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {row.role}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                  {row.calls}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                  {formatWords(row.tokens)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatUsd(row.usd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="hidden md:table-cell" />
              <TableCell />
              <TableCell />
              <TableCell className="text-right font-mono tabular-nums">
                {formatUsd(total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Costs are metered per model call and update live during generation.
      </p>
    </div>
  );
}

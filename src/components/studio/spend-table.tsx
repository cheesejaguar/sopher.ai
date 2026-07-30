import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AsyncState } from "@/components/studio/product-primitives";
import { formatCredits, formatUsd } from "@/components/usage/format";
import { creditsForUsd } from "@/lib/billing/credits-shared";

export type ProjectSpendRow = {
  projectId: string | null;
  title: string | null;
  usd: number;
  calls: number;
};

/** Spend by book from metered llm_calls, with mono tabular numerals. */
export function SpendTable({ rows }: { rows: ProjectSpendRow[] }) {
  const totalSpend = rows.reduce((sum, row) => sum + row.usd, 0);

  if (rows.length === 0) {
    return (
      <AsyncState
        status="empty"
        compact
        title="No credit use yet"
        description="Usage appears here the moment a book starts generating."
      />
    );
  }

  return (
    <Table scrollLabel="Credit use by book">
      <caption className="sr-only">Spend by book, month to date</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Book</TableHead>
          <TableHead scope="col" className="text-right">
            Model calls
          </TableHead>
          <TableHead scope="col" className="text-right">
            Credits
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.projectId ?? "deleted"}>
            <TableCell className="font-medium">
              {row.projectId && row.title ? (
                <Link
                  href={`/projects/${row.projectId}/usage`}
                  className="hover:text-primary hover:underline underline-offset-4"
                >
                  {row.title}
                </Link>
              ) : (
                <span className="text-muted-foreground italic">Deleted book</span>
              )}
            </TableCell>
            <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
              {row.calls.toLocaleString("en-US")}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              <span className="block">{formatCredits(creditsForUsd(row.usd))}</span>
              <span className="block text-[0.65rem] text-muted-foreground">
                {formatUsd(row.usd)} metered
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell />
          <TableCell className="text-right font-mono tabular-nums">
            <span className="block">{formatCredits(creditsForUsd(totalSpend))}</span>
            <span className="block text-[0.65rem] font-normal text-muted-foreground">
              {formatUsd(totalSpend)} metered
            </span>
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

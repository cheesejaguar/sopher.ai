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
import { formatUsd } from "@/components/usage/format";

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
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing metered yet — spend appears the moment a book starts generating.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Book</TableHead>
          <TableHead className="text-right">Model calls</TableHead>
          <TableHead className="text-right">Spend</TableHead>
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
              {formatUsd(row.usd)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell />
          <TableCell className="text-right font-mono tabular-nums">
            {formatUsd(totalSpend)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

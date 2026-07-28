import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTokens, formatUsd } from "./format";

export type RoleSpendRow = {
  agentRole: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  usd: number;
};

/** Per-role/model spend with token columns. Cached input is billed at ~10%. */
export function RoleTable({ rows }: { rows: RoleSpendRow[] }) {
  const totalUsd = rows.reduce((sum, r) => sum + r.usd, 0);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No model calls yet — costs appear here as agents work.
      </p>
    );
  }

  return (
    <Table aria-label="Spend by agent role and model">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Role</TableHead>
          <TableHead scope="col" className="hidden lg:table-cell">
            Model
          </TableHead>
          <TableHead scope="col" className="text-right">
            Calls
          </TableHead>
          <TableHead scope="col" className="hidden text-right sm:table-cell">
            Input
          </TableHead>
          <TableHead scope="col" className="hidden text-right sm:table-cell">
            Output
          </TableHead>
          <TableHead scope="col" className="hidden text-right md:table-cell">
            Cached (90% off)
          </TableHead>
          <TableHead scope="col" className="text-right">
            Cost
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.agentRole}-${row.model}`}>
            <TableHead scope="row" className="h-auto p-2 font-medium capitalize">
              {row.agentRole}
            </TableHead>
            <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
              {row.model}
            </TableCell>
            <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
              {row.calls}
            </TableCell>
            <TableCell className="hidden text-right font-mono text-muted-foreground tabular-nums sm:table-cell">
              {formatTokens(row.inputTokens)}
            </TableCell>
            <TableCell className="hidden text-right font-mono text-muted-foreground tabular-nums sm:table-cell">
              {formatTokens(row.outputTokens)}
            </TableCell>
            <TableCell className="hidden text-right font-mono text-muted-foreground tabular-nums md:table-cell">
              {formatTokens(row.cachedInputTokens)}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {formatUsd(row.usd)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableHead scope="row" className="h-auto p-2">
            Total
          </TableHead>
          <TableCell className="hidden lg:table-cell" />
          <TableCell />
          <TableCell className="hidden sm:table-cell" />
          <TableCell className="hidden sm:table-cell" />
          <TableCell className="hidden md:table-cell" />
          <TableCell className="text-right font-mono tabular-nums">{formatUsd(totalUsd)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

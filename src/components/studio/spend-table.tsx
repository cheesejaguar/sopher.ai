import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUsd, formatWords, type Project } from "@/lib/placeholder-data";

/** All-time spend by book, with mono tabular numerals. */
export function SpendTable({ projects }: { projects: Project[] }) {
  const totalSpend = projects.reduce((sum, project) => sum + project.spendUsd, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Book</TableHead>
          <TableHead className="text-right">Words</TableHead>
          <TableHead className="text-right">Spend</TableHead>
          <TableHead className="text-right">Estimate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell className="font-medium">{project.title}</TableCell>
            <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
              {formatWords(project.wordCount)}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {formatUsd(project.spendUsd)}
            </TableCell>
            <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
              ~{formatUsd(project.estimateUsd)}
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
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  );
}

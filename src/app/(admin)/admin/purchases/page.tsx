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
import { RelativeTime } from "@/components/relative-time";
import { listPurchases } from "@/db/queries/admin";

export const metadata = { title: "Purchases — admin" };

function stripeLink(ref: string | null): string | null {
  if (!ref) return null;
  if (ref.startsWith("cs_")) return `https://dashboard.stripe.com/checkout/sessions/${ref}`;
  if (ref.startsWith("refund:")) return null;
  return null;
}

export default async function AdminPurchases() {
  const { rows, purchasedTotal } = await listPurchases();

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Purchases</h1>
      <Table aria-label="Purchases, refunds and adjustments">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">When</TableHead>
            <TableHead scope="col">User</TableHead>
            <TableHead scope="col">Kind</TableHead>
            <TableHead scope="col">Detail</TableHead>
            <TableHead scope="col" className="text-right">
              Credits
            </TableHead>
            <TableHead scope="col">Ref</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const link = stripeLink(row.externalRef);
            return (
              <TableRow key={row.id}>
                <TableCell className="text-muted-foreground">
                  <RelativeTime iso={row.createdAt.toISOString()} />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/users/${row.userId}`}
                    className="text-primary hover:underline"
                  >
                    {row.email}
                  </Link>
                </TableCell>
                <TableCell>{row.kind}</TableCell>
                <TableCell className="text-muted-foreground">{row.description}</TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${Number(row.amount) < 0 ? "text-destructive" : ""}`}
                >
                  {Number(row.amount) > 0 ? "+" : ""}
                  {Number(row.amount).toFixed(2)}
                </TableCell>
                <TableCell className="max-w-40 truncate font-mono text-xs text-muted-foreground">
                  {link ? (
                    <a href={link} className="text-primary hover:underline">
                      {row.externalRef}
                    </a>
                  ) : (
                    (row.externalRef ?? "—")
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4}>Purchased credits (face value)</TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {purchasedTotal.toFixed(2)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

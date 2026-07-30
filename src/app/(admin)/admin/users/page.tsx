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
import { formatCredits, formatUsd } from "@/components/usage/format";
import { listUsersWithStats } from "@/db/queries/admin";
import { RelativeTime } from "@/components/relative-time";
import { PageHeader } from "@/components/studio/product-primitives";

export const metadata = { title: "Users — admin" };

export default async function AdminUsers() {
  const users = await listUsersWithStats();

  return (
    <div className="space-y-4">
      <PageHeader
        label="Admin / Accounts"
        title="Users"
        description="Balances, book activity, and account state."
      />
      <Table aria-label="All users" scrollLabel="All users">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">User</TableHead>
            <TableHead scope="col">Joined</TableHead>
            <TableHead scope="col" className="text-right">
              Balance
            </TableHead>
            <TableHead scope="col" className="text-right">
              Metered
            </TableHead>
            <TableHead scope="col" className="text-right">
              Books
            </TableHead>
            <TableHead scope="col">Last activity</TableHead>
            <TableHead scope="col">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <Link
                  href={`/admin/users/${user.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {user.email}
                </Link>
                {user.name ? (
                  <span className="ml-2 text-xs text-muted-foreground">{user.name}</span>
                ) : null}
                {user.role === "admin" ? (
                  <Badge variant="outline" className="ml-2 text-[0.65rem]">
                    admin
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground">
                <RelativeTime iso={user.createdAt.toISOString()} />
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatCredits(user.balance)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatUsd(user.meteredUsd)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {user.projectCount}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {user.lastActivity ? (
                  <RelativeTime iso={new Date(user.lastActivity).toISOString()} />
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                {user.suspended ? <Badge variant="destructive">Suspended</Badge> : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

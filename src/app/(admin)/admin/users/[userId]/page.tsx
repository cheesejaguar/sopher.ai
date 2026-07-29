import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserActions } from "@/components/admin/user-actions";
import { RelativeTime } from "@/components/relative-time";
import { formatCredits, formatUsd } from "@/components/usage/format";
import { getUserDetail } from "@/db/queries/admin";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "User — admin" };

export default async function AdminUserDetail({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const { userId: adminId } = await requireAdmin();
  const detail = await getUserDetail(userId);
  if (!detail) notFound();
  const { user, ledger, projects, runs, balance, callStats } = detail;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{user.email}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.name ?? "No name"} · joined <RelativeTime iso={user.createdAt.toISOString()} />
            {user.role === "admin" ? " · admin" : ""}
            {user.suspended ? " · SUSPENDED" : ""}
          </p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            {formatCredits(balance)} balance · {formatUsd(callStats.usd)} metered over{" "}
            {callStats.calls} calls
          </p>
        </div>
        <UserActions
          userId={user.id}
          email={user.email}
          suspended={user.suspended}
          isSelf={user.id === adminId}
        />
      </header>

      <section aria-labelledby="u-projects" className="space-y-2">
        <h2 id="u-projects" className="font-sans font-semibold">
          Books · {projects.length}
        </h2>
        <Table aria-label="User's books">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Title</TableHead>
              <TableHead scope="col">Genre</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col" className="text-right">
                Words
              </TableHead>
              <TableHead scope="col">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell>
                  <Link
                    href={`/admin/books/${project.id}`}
                    className="text-primary hover:underline"
                  >
                    {project.title}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{project.genre ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{project.status}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {project.words.toLocaleString()}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <RelativeTime iso={project.updatedAt.toISOString()} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section aria-labelledby="u-runs" className="space-y-2">
        <h2 id="u-runs" className="font-sans font-semibold">
          Recent runs
        </h2>
        <Table aria-label="User's runs">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">When</TableHead>
              <TableHead scope="col">Kind</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="text-muted-foreground">
                  <Link href={`/admin/runs/${run.id}`} className="hover:underline">
                    <RelativeTime iso={run.createdAt.toISOString()} />
                  </Link>
                </TableCell>
                <TableCell>{run.kind}</TableCell>
                <TableCell>
                  <Badge variant={run.status === "failed" ? "destructive" : "outline"}>
                    {run.status}
                  </Badge>
                </TableCell>
                <TableCell
                  className="max-w-md truncate text-muted-foreground"
                  title={run.error ?? ""}
                >
                  {run.error ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section aria-labelledby="u-ledger" className="space-y-2">
        <h2 id="u-ledger" className="font-sans font-semibold">
          Ledger
        </h2>
        <Table aria-label="Credit ledger">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">When</TableHead>
              <TableHead scope="col">Kind</TableHead>
              <TableHead scope="col">Detail</TableHead>
              <TableHead scope="col" className="text-right">
                Credits
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-muted-foreground">
                  <RelativeTime iso={entry.createdAt.toISOString()} />
                </TableCell>
                <TableCell>{entry.kind}</TableCell>
                <TableCell className="text-muted-foreground">{entry.description}</TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${Number(entry.amount) < 0 ? "text-muted-foreground" : "text-ai"}`}
                >
                  {Number(entry.amount) > 0 ? "+" : ""}
                  {Number(entry.amount).toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

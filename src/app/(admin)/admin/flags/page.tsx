import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { FlagActions } from "@/components/admin/flag-actions";
import { RelativeTime } from "@/components/relative-time";
import { listFlags } from "@/db/queries/admin";

export const metadata = { title: "Flags — admin" };

const STATUSES = ["open", "dismissed", "actioned"] as const;

/**
 * The moderation queue. Everything here was flagged quietly — the author never
 * saw anything, generation never stopped. Dismiss clears false positives;
 * Actioned records that a human dealt with it (suspension, if warranted, is a
 * separate deliberate step on the user page).
 */
export default async function AdminFlags({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = (STATUSES as readonly string[]).includes(status ?? "")
    ? (status as (typeof STATUSES)[number])
    : "open";
  const flags = await listFlags(active);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Moderation flags</h1>
        <nav aria-label="Flag status filter" className="flex gap-1">
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/flags?status=${s}`}
              aria-current={s === active ? "page" : undefined}
              className={`rounded-md px-3 py-1 text-sm capitalize ${
                s === active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </Link>
          ))}
        </nav>
      </header>

      {flags.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No {active} flags. Quiet is good.
        </p>
      ) : (
        <ul className="space-y-3">
          {flags.map((flag) => (
            <li key={flag.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge variant={flag.severity === "urgent" ? "destructive" : "outline"}>
                      {flag.category}
                    </Badge>
                    {flag.severity === "urgent" ? (
                      <Badge variant="destructive">urgent</Badge>
                    ) : null}
                    <span className="text-sm text-muted-foreground">
                      {flag.source}
                      {flag.chapterNumber ? ` · chapter ${flag.chapterNumber}` : ""} ·{" "}
                      <RelativeTime iso={flag.createdAt.toISOString()} />
                    </span>
                  </p>
                  <p className="text-sm">
                    <Link
                      href={`/admin/books/${flag.projectId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {flag.title}
                    </Link>{" "}
                    <span className="text-muted-foreground">by {flag.email}</span>
                  </p>
                  {flag.excerpt ? (
                    <p className="text-sm italic text-muted-foreground">“{flag.excerpt}”</p>
                  ) : null}
                  {flag.detail ? <p className="text-sm">{flag.detail}</p> : null}
                  {flag.reviewedBy ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      reviewed by {flag.reviewedBy}
                    </p>
                  ) : null}
                </div>
                {flag.status === "open" ? <FlagActions flagId={flag.id} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

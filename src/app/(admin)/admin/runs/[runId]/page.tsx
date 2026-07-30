import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { getRunEvents } from "@/db/queries/admin";
import { AsyncState, PageHeader } from "@/components/studio/product-primitives";

export const metadata = { title: "Run — admin" };

/**
 * The debug view: the run's persisted event log in seq order — the server-side
 * truth of what the author's screen showed. Pair with
 * `npx workflow inspect run <workflowRunId>` for step-level detail.
 */
export default async function AdminRunDetail({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const data = await getRunEvents(runId);
  if (!data) notFound();
  const { run, events } = data;

  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          label="Admin / Run telemetry"
          title={`Run · ${run.title}`}
          description={`${run.email} · ${run.kind}`}
          actions={
            <>
              <Badge variant={run.status === "failed" ? "destructive" : "outline"}>
                {run.status}
              </Badge>
              <Link href={`/admin/books/${run.projectId}`} className="text-primary hover:underline">
                view book
              </Link>
            </>
          }
        />
        {run.error ? (
          <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {run.error}
          </p>
        ) : null}
        {run.workflowRunId ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            npx workflow inspect run {run.workflowRunId} --backend vercel --project sopher-ai --team
            cheesejaguar-2353s-projects
          </p>
        ) : null}
      </div>

      <section aria-label="Event log">
        <ol className="space-y-1 font-mono text-xs">
          {events.map((event) => (
            <li key={event.seq} className="flex gap-3 rounded px-2 py-1 odd:bg-muted/40">
              <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">
                {event.seq}
              </span>
              <span className="w-16 shrink-0 text-muted-foreground">{event.type}</span>
              <span className="min-w-0 break-all whitespace-pre-wrap">
                {JSON.stringify(event.payload)}
              </span>
            </li>
          ))}
          {events.length === 0 ? (
            <li>
              <AsyncState
                status="empty"
                compact
                title="No events persisted"
                description="This run has not written telemetry to the event log."
              />
            </li>
          ) : null}
        </ol>
      </section>
    </div>
  );
}

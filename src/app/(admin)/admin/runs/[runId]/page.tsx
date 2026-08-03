import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { getRunEvents } from "@/db/queries/admin";
import { AsyncState, PageHeader } from "@/components/studio/product-primitives";
import { CancelRunButton } from "@/components/admin/cancel-run-button";
import { RecheckRunButton } from "@/components/admin/recheck-run-button";
import { RunRecoveryButton } from "@/components/admin/run-recovery-button";
import { RelativeTime } from "@/components/relative-time";
import { formatCredits, formatUsd } from "@/components/usage/format";

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
  const {
    run,
    health,
    checkpoints,
    artifacts,
    credit,
    recommendedAction,
    events,
    incidents,
    inputs,
  } = data;
  const active = ["queued", "running", "awaiting_input"].includes(health.effectiveStatus);

  const facts = [
    ["Database", health.databaseStatus],
    ["Workflow", health.workflowStatus],
    ["Effective", health.effectiveStatus],
    ["Health", health.health],
    ["Stage", `${health.stage} · ${health.progressPct}%`],
    ["Pause", health.pause ? `${health.pause.kind} · version ${health.pause.version}` : "none"],
    ["Dispatches", String(health.dispatchAttempts)],
    [
      "Heartbeat",
      health.heartbeatAt ? new Date(health.heartbeatAt).toLocaleString("en-US") : "none recorded",
    ],
    [
      "Last confirmed update",
      health.lastUpdateAt ? new Date(health.lastUpdateAt).toLocaleString("en-US") : "none recorded",
    ],
    ["Authoring began", health.authoringBegan ? "yes" : "no"],
    ["Saved chapters", String(health.savedChapterCount)],
    ["Saved checkpoints", String(health.savedCheckpointCount)],
    ["Support reference", health.supportReference],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title={`Run · ${run.title}`}
          description={`${run.email} · ${run.kind}`}
          actions={
            <>
              <Badge
                variant={
                  health.health === "critical" || health.effectiveStatus === "failed"
                    ? "destructive"
                    : "outline"
                }
              >
                {health.effectiveStatus}
              </Badge>
              <RecheckRunButton runId={run.id} />
              {recommendedAction.kind === "redispatch" ? (
                <RunRecoveryButton action="redispatch" runId={run.id} />
              ) : null}
              {active && !health.cancellation ? <CancelRunButton runId={run.id} /> : null}
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

      <section
        aria-labelledby="recommended-action-heading"
        className="border border-primary/35 bg-primary/5 p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="recommended-action-heading" className="text-base font-semibold">
            Recommended operator action
          </h2>
          <Badge variant="outline">{recommendedAction.kind.replaceAll("_", " ")}</Badge>
        </div>
        <p className="mt-2 font-medium">{recommendedAction.label}</p>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
          {recommendedAction.description}
        </p>
      </section>

      <section aria-labelledby="run-state-heading" className="border-y border-border py-4">
        <h2 id="run-state-heading" className="text-base font-semibold">
          Fresh effective health
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Workflow was probed for this page load, then reconciled with durable database evidence.
        </p>
        <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0 border-t border-border/70 pt-2">
              <dt className="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase">
                {label}
              </dt>
              <dd className="mt-1 break-words text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        {health.stageDescription ? (
          <p className="mt-4 max-w-3xl text-sm text-muted-foreground">{health.stageDescription}</p>
        ) : null}
        {health.cancellation ? (
          <p className="mt-4 border-y border-ember/35 py-2 text-sm">
            Cancellation requested <RelativeTime iso={health.cancellation.requestedAt} />. The run
            remains active until Workflow confirms it stopped.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="proof-heading" className="space-y-3">
        <div>
          <h2 id="proof-heading" className="text-base font-semibold">
            Checkpoints, artifacts, and completion proof
          </h2>
          <p className="text-sm text-muted-foreground">
            Counts and provenance only. Prompts, briefs, manuscript text, and approval notes are not
            included.
          </p>
        </div>
        <dl className="grid gap-x-8 gap-y-3 border-y border-border py-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Protocol", `v${checkpoints.protocolVersion}`],
            ["Dispatch snapshot", checkpoints.dispatchReady ? "ready" : "not recorded"],
            [
              "Staged plan",
              `${checkpoints.stagedConcept ? "concept" : "no concept"} · ${
                checkpoints.stagedOutline ? "outline" : "no outline"
              }`,
            ],
            [
              "Preparation",
              `${checkpoints.preparationSteps} checkpoints · ${
                checkpoints.manuscriptPrepared ? "committed" : "not committed"
              }`,
            ],
            [
              "Chapter work",
              `${checkpoints.chapterPlans} planned · ${checkpoints.chapterDrafts} drafted · ${checkpoints.chapterResults} results`,
            ],
            [
              "Editorial work",
              `${checkpoints.chapterSummaries} summaries · ${checkpoints.editedChapters} edits · ${checkpoints.revisionChapters} revisions`,
            ],
            [
              "Continuity",
              `${checkpoints.continuityPhases} phases · ${
                checkpoints.continuityReport ? "report stored" : "no report"
              }`,
            ],
            [
              "Finalization",
              checkpoints.finalized
                ? `${checkpoints.finalizationOwnedByRun ? "owned by this run" : "foreign source"} · ${
                    checkpoints.completionDigestRecorded ? "digest recorded" : "digest missing"
                  }`
                : "not finalized",
            ],
            ["Outlines", String(artifacts.outlineCount)],
            [
              "Live chapters",
              `${artifacts.contentChapterCount}/${artifacts.chapterCount} with content · ${artifacts.finalChapterCount} final`,
            ],
            [
              "Story bible",
              `${artifacts.entityCount} entities · ${artifacts.relationshipCount} relationships`,
            ],
            ["Assets", `${artifacts.assetCount} total · ${artifacts.exportCount} exports`],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 border-t border-border/70 pt-2">
              <dt className="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase">
                {label}
              </dt>
              <dd className="mt-1 break-words text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          Completion proof:{" "}
          <strong>{health.completionArtifactsReady ? "valid" : "not established"}</strong>
        </p>
      </section>

      <section aria-labelledby="credit-heading" className="space-y-3">
        <div>
          <h2 id="credit-heading" className="text-base font-semibold">
            Spend and open holds
          </h2>
          <p className="text-sm text-muted-foreground">
            Settled run spend is separate from still-open reservations.
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="border-y border-border py-3">
            <dt className="text-xs text-muted-foreground">Credits used</dt>
            <dd className="font-mono text-lg tabular-nums">{formatCredits(credit.creditsUsed)}</dd>
          </div>
          <div className="border-y border-border py-3">
            <dt className="text-xs text-muted-foreground">Metered model cost</dt>
            <dd className="font-mono text-lg tabular-nums">{formatUsd(credit.meteredUsd)}</dd>
          </div>
          <div className="border-y border-border py-3">
            <dt className="text-xs text-muted-foreground">Open reservations</dt>
            <dd className="font-mono text-lg tabular-nums">
              {credit.openHolds.length} · {formatCredits(credit.openHeldCredits)}
            </dd>
          </div>
        </dl>
        {credit.openHolds.length > 0 ? (
          <ol className="divide-y divide-border border-y border-border text-sm">
            {credit.openHolds.map((hold) => (
              <li
                key={hold.externalRef}
                className="grid gap-1 py-2 sm:grid-cols-[1fr_auto_auto] sm:gap-4"
              >
                <code className="min-w-0 break-all text-xs">{hold.externalRef}</code>
                <span className="font-mono tabular-nums">{formatCredits(hold.heldCredits)}</span>
                <span className="text-xs text-muted-foreground">
                  Open <RelativeTime iso={new Date(hold.createdAt).toISOString()} />
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No open reservations.</p>
        )}
      </section>

      <section aria-labelledby="incidents-heading" className="space-y-3">
        <div>
          <h2 id="incidents-heading" className="text-base font-semibold">
            Operational incidents
          </h2>
          <p className="text-sm text-muted-foreground">
            Content-free evidence recorded by reconciliation and recovery checks.
          </p>
        </div>
        {incidents.length === 0 ? (
          <AsyncState
            status="empty"
            compact
            title="No incidents recorded"
            description="No reconciliation anomaly has been persisted for this run."
          />
        ) : (
          <ol className="divide-y divide-border border-y border-border">
            {incidents.map((incident) => (
              <li key={incident.id} className="grid gap-3 py-3 md:grid-cols-[12rem_1fr_auto]">
                <div>
                  <Badge variant={incident.severity === "critical" ? "destructive" : "outline"}>
                    {incident.severity}
                  </Badge>
                  <p className="mt-2 text-sm font-medium">{incident.category}</p>
                </div>
                <pre className="min-w-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
                  {JSON.stringify(incident.evidence, null, 2)}
                </pre>
                <div className="text-xs text-muted-foreground md:text-right">
                  <p>{incident.occurrenceCount} observation(s)</p>
                  <p>
                    Last <RelativeTime iso={new Date(incident.lastObservedAt).toISOString()} />
                  </p>
                  <p>{incident.resolvedAt ? "Resolved" : "Open"}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="input-heading" className="space-y-3">
        <div>
          <h2 id="input-heading" className="text-base font-semibold">
            Author input delivery
          </h2>
          <p className="text-sm text-muted-foreground">
            Delivery state only; author notes and manuscript content are intentionally omitted.
          </p>
        </div>
        {inputs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No durable input requests.</p>
        ) : (
          <ol className="divide-y divide-border border-y border-border text-sm">
            {inputs.map((input) => (
              <li
                key={input.id}
                className="grid gap-2 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
              >
                <span>
                  {input.kind} · pause {input.pauseVersion}
                </span>
                <Badge variant="outline">{input.status}</Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {input.deliveryAttempts} delivery attempt(s)
                </span>
                <span className="text-xs text-muted-foreground">
                  <RelativeTime iso={new Date(input.acceptedAt).toISOString()} />
                </span>
                {input.status === "accepted" ? (
                  <span className="sm:col-span-4">
                    <RunRecoveryButton action="redeliver" inputId={input.id} />
                  </span>
                ) : null}
                {input.lastDeliveryError ? (
                  <span className="text-xs text-destructive sm:col-span-4">
                    {input.lastDeliveryError}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Event log">
        <h2 className="mb-3 text-base font-semibold">Durable event log</h2>
        <ol className="space-y-1 font-mono text-xs">
          {events.map((event) => (
            <li key={event.seq} className="flex gap-3 rounded px-2 py-1 odd:bg-muted/40">
              <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">
                {event.seq}
              </span>
              <span className="w-16 shrink-0 text-muted-foreground">{event.type}</span>
              <span
                className="hidden w-28 shrink-0 truncate text-muted-foreground xl:block"
                title={event.eventKey ?? "legacy event"}
              >
                {event.eventKey ?? "legacy"}
              </span>
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

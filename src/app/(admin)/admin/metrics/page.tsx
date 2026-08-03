import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCredits, formatUsd } from "@/components/usage/format";
import {
  getAcquisitionChannels,
  getAcquisitionFunnel,
  getAuthoringOperationsMetrics,
  getProductMetrics,
  getWeeklyEconomics,
  getWizardFunnel,
} from "@/db/queries/metrics";
import { AsyncState, PageHeader } from "@/components/studio/product-primitives";

export const metadata = { title: "Metrics — admin" };

const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);
const days = (value: number | null) =>
  value === null ? "—" : value < 1 ? `${Math.round(value * 24)}h` : `${value.toFixed(1)}d`;
const seconds = (value: number | null) => {
  if (value === null) return "—";
  if (value < 60) return `${Math.round(value)}s`;
  return `${(value / 60).toFixed(value < 600 ? 1 : 0)}m`;
};
const hours = (value: number | null) => {
  if (value === null) return "—";
  if (value < 1) return `${Math.round(value * 60)}m`;
  if (value < 48) return `${value.toFixed(value < 10 ? 1 : 0)}h`;
  return `${(value / 24).toFixed(1)}d`;
};

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

async function Funnel() {
  const stages = await getAcquisitionFunnel();
  return (
    <Section
      title="Acquisition funnel"
      hint="Counted per person, not per book — one author with nine drafts is one conversion. Admin accounts excluded."
    >
      <Table aria-label="Acquisition funnel" scrollLabel="Acquisition funnel">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Stage</TableHead>
            <TableHead scope="col" className="text-right">
              People
            </TableHead>
            <TableHead scope="col" className="text-right">
              From previous
            </TableHead>
            <TableHead scope="col" className="text-right">
              Median time from signup
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stages.map((stage) => (
            <TableRow key={stage.stage}>
              <TableCell className="font-medium">{stage.stage}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{stage.count}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {pct(stage.conversionFromPrevious)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                {days(stage.medianDaysFromSignup)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

async function Economics() {
  const weeks = await getWeeklyEconomics();
  return (
    <Section
      title="Weekly economics"
      hint="Revenue is what Stripe collected, net of refunds — not credits, which the bonus tiers inflate. COGS is metered model spend."
    >
      <Table aria-label="Weekly economics" scrollLabel="Weekly economics">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Week of</TableHead>
            <TableHead scope="col" className="text-right">
              Revenue
            </TableHead>
            <TableHead scope="col" className="text-right">
              COGS
            </TableHead>
            <TableHead scope="col" className="text-right">
              Margin
            </TableHead>
            <TableHead scope="col" className="text-right">
              Signups
            </TableHead>
            <TableHead scope="col" className="text-right">
              Books finished
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {weeks.map((week) => {
            const margin =
              week.revenue_usd > 0 ? (week.revenue_usd - week.cogs_usd) / week.revenue_usd : null;
            return (
              <TableRow key={week.week}>
                <TableCell className="font-mono text-xs">{week.week}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatUsd(week.revenue_usd)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {formatUsd(week.cogs_usd)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${
                    margin !== null && margin < 0 ? "text-destructive" : ""
                  }`}
                >
                  {pct(margin)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{week.signups}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {week.books_finished}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Section>
  );
}

async function Channels() {
  const channels = await getAcquisitionChannels();
  return (
    <Section
      title="Where customers came from"
      hint="First touch, captured on the landing request and stamped once at signup. Rows appear as attributed users arrive — existing accounts predate this and show as unattributed."
    >
      {channels.length === 0 ? (
        <AsyncState
          status="empty"
          compact
          title="No attributed users yet"
          description="Channel rows will appear as newly attributed accounts arrive."
        />
      ) : (
        <Table aria-label="Acquisition channels" scrollLabel="Acquisition channels">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Channel</TableHead>
              <TableHead scope="col" className="text-right">
                Users
              </TableHead>
              <TableHead scope="col" className="text-right">
                Payers
              </TableHead>
              <TableHead scope="col" className="text-right">
                Conversion
              </TableHead>
              <TableHead scope="col" className="text-right">
                Revenue
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((channel) => (
              <TableRow key={channel.channel}>
                <TableCell className="font-medium">{channel.channel}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{channel.users}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {channel.payers}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {pct(channel.users > 0 ? channel.payers / channel.users : null)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatUsd(channel.revenue_usd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}

async function Wizard() {
  const steps = await getWizardFunnel();
  const top = steps[0]?.reached ?? 0;
  return (
    <Section
      title="Wizard drop-off"
      hint="Last 30 days. The one thing Postgres could not already answer — the draft lives in the browser until submit, so this is the only trace of an author who gave up partway."
    >
      {steps.length === 0 ? (
        <AsyncState
          status="empty"
          compact
          title="No wizard events yet"
          description="Funnel activity will appear after authors begin the setup flow."
        />
      ) : (
        <Table aria-label="Wizard drop-off" scrollLabel="Wizard drop-off">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Step</TableHead>
              <TableHead scope="col" className="text-right">
                Reached
              </TableHead>
              <TableHead scope="col" className="text-right">
                Of those who started
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {steps.map((step) => (
              <TableRow key={`${step.step}-${step.step_id}`}>
                <TableCell className="font-medium capitalize">
                  {step.step + 1}. {step.step_id}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{step.reached}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {pct(top > 0 ? step.reached / top : null)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}

async function Product() {
  const { repeat, genres, tiers, runs } = await getProductMetrics();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="font-mono text-[0.68rem] font-normal tracking-[0.14em] text-muted-foreground uppercase">
              Repeat purchase
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold tabular-nums">
              {pct(repeat.buyers > 0 ? repeat.repeat_buyers / repeat.buyers : null)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {repeat.repeat_buyers} of {repeat.buyers} buyers ·{" "}
              {Number(repeat.avg_purchases).toFixed(1)} avg
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="font-mono text-[0.68rem] font-normal tracking-[0.14em] text-muted-foreground uppercase">
              Run success
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold tabular-nums">
              {pct(runs.total > 0 ? runs.completed / runs.total : null)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {runs.completed} completed · {runs.failed} failed of {runs.total}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="font-mono text-[0.68rem] font-normal tracking-[0.14em] text-muted-foreground uppercase">
              Time to finish
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold tabular-nums">
              {runs.median_minutes === null ? "—" : `${Math.round(runs.median_minutes)}m`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">median, full-book runs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="font-mono text-[0.68rem] font-normal tracking-[0.14em] text-muted-foreground uppercase">
              Tier mix
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-0.5 text-sm">
              {tiers.map((tier) => (
                <li key={tier.tier} className="flex justify-between">
                  <span className="capitalize text-muted-foreground">{tier.tier}</span>
                  <span className="font-mono tabular-nums">{tier.runs}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Section title="Genres" hint="What people actually ask for, and how often they finish it.">
        <Table aria-label="Books by genre" scrollLabel="Books by genre">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Genre</TableHead>
              <TableHead scope="col" className="text-right">
                Books
              </TableHead>
              <TableHead scope="col" className="text-right">
                Finished
              </TableHead>
              <TableHead scope="col" className="text-right">
                Completion
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {genres.map((genre) => (
              <TableRow key={genre.genre}>
                <TableCell className="font-medium capitalize">{genre.genre}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{genre.books}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {genre.finished}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {pct(genre.books > 0 ? genre.finished / genre.books : null)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </>
  );
}

async function AuthoringOperations() {
  const metrics = await getAuthoringOperationsMetrics();
  const cards = [
    {
      title: "First authoring event",
      value: seconds(metrics.firstAuthoringEvent.medianSeconds),
      detail: `p95 ${seconds(metrics.firstAuthoringEvent.p95Seconds)} · ${metrics.firstAuthoringEvent.sample} runs`,
    },
    {
      title: "Waiting for author",
      value: String(metrics.actionWaits.count),
      detail: `median ${hours(metrics.actionWaits.medianHours)} · oldest ${hours(metrics.actionWaits.oldestHours)}`,
    },
    {
      title: "Open anomalies",
      value: String(metrics.anomalies.count),
      detail: `median ${hours(metrics.anomalies.medianHours)} · oldest ${hours(metrics.anomalies.oldestHours)}`,
    },
    {
      title: "Redispatch handoff",
      value: pct(metrics.redispatch.rate),
      detail: `${metrics.redispatch.recovered} of ${metrics.redispatch.attempts} retries produced durable work without terminal failure`,
    },
    {
      title: "Saved-work recovery",
      value: pct(metrics.recovery.rate),
      detail: `${metrics.recovery.completed} of ${metrics.recovery.attempts} explicit recovery runs completed`,
    },
    {
      title: "Stale credit holds",
      value: String(metrics.staleHolds.count),
      detail: `${formatCredits(metrics.staleHolds.credits)} trapped · oldest ${hours(metrics.staleHolds.oldestHours)}`,
    },
    {
      title: "Story to purchase",
      value: pct(metrics.trialConversion.rate),
      detail: `${metrics.trialConversion.purchasers} of ${metrics.trialConversion.completedTrials} completed included stories`,
    },
  ];

  return (
    <Section
      title="Authoring operations"
      hint="Durable server evidence. Latency covers the last 30 days; waits, incidents, recovery, stale holds, and post-story purchase conversion are current/all-time cohorts."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-1">
              <CardTitle className="font-mono text-[0.68rem] font-normal tracking-[0.14em] text-muted-foreground uppercase">
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-display text-2xl font-semibold tabular-nums">{card.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{card.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

function Loading() {
  return <Skeleton className="h-48 w-full rounded-sm" />;
}

/**
 * Business metrics. Each section streams independently — several are
 * percentile queries over the whole ledger, and one slow aggregate should not
 * hold the rest of the page.
 */
export default function AdminMetrics() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Metrics"
        description="Acquisition, economics, product behavior, and wizard completion."
      />
      <Suspense fallback={<Loading />}>
        <Funnel />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Economics />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Channels />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Product />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <AuthoringOperations />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Wizard />
      </Suspense>
    </div>
  );
}

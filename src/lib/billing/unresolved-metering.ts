import "server-only";

import { and, desc, eq, like, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb, schema } from "@/db";
import { resolveAuthoringIncident } from "@/lib/authoring-incidents";
import type { GenerationConfig } from "@/lib/run-events";

export type MeteringLineageRun = {
  id: string;
  projectId: string;
  userId: string;
  status: string;
  config: unknown;
};

type MeteringLineageCandidate = MeteringLineageRun & {
  lineageRunId: string;
  intentPrefix: string;
};

function configuredBillingLineage(config: unknown): string | null {
  if (!config || typeof config !== "object") return null;
  const lineage = (config as Partial<GenerationConfig>).billingLineageRunId;
  return typeof lineage === "string" && lineage.length > 0 ? lineage : null;
}

/**
 * A pending provider intent is expected while a live call is in flight. It is
 * evidence-unsafe only after the owning authoring attempt is terminal: at that
 * point a replacement run would reuse the same logical billing key and could
 * repeat a provider call whose charge is still ambiguous.
 */
export function unresolvedMeteringCandidate(
  run: MeteringLineageRun,
): MeteringLineageCandidate | null {
  if (run.status !== "failed" && run.status !== "cancelled") return null;
  const lineageRunId = configuredBillingLineage(run.config) ?? run.id;
  return {
    ...run,
    lineageRunId,
    intentPrefix: `metering-intent:generation:${lineageRunId}:`,
  };
}

/**
 * Return terminal attempts whose logical billing lineage still has a provider
 * intent without a durable settled/aborted marker. This is a content-free,
 * fail-closed read only: it never settles, aborts, refunds, or repeats work.
 */
export async function findRunsWithUnresolvedMetering(
  runs: MeteringLineageRun[],
): Promise<Set<string>> {
  const candidates = runs.flatMap((run) => {
    const candidate = unresolvedMeteringCandidate(run);
    return candidate ? [candidate] : [];
  });
  if (candidates.length === 0) return new Set();

  const db = getDb();
  const terminalLedger = alias(schema.creditLedger, "terminal_metering_ledger");
  const candidateFilter = or(
    ...candidates.map((candidate) =>
      and(
        eq(schema.creditLedger.userId, candidate.userId),
        eq(schema.creditLedger.projectId, candidate.projectId),
        like(schema.creditLedger.externalRef, `${candidate.intentPrefix}%`),
      ),
    ),
  );
  if (!candidateFilter) return new Set();

  const rows = await db
    .select({
      userId: schema.creditLedger.userId,
      projectId: schema.creditLedger.projectId,
      externalRef: schema.creditLedger.externalRef,
    })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.kind, "adjustment"),
        eq(schema.creditLedger.amount, "0"),
        candidateFilter,
        notExists(
          db
            .select({ id: terminalLedger.id })
            .from(terminalLedger)
            .where(
              or(
                eq(
                  terminalLedger.externalRef,
                  sql<string>`'intent-settled:' || ${schema.creditLedger.externalRef}`,
                ),
                eq(
                  terminalLedger.externalRef,
                  sql<string>`'intent-aborted:' || ${schema.creditLedger.externalRef}`,
                ),
              ),
            ),
        ),
      ),
    );

  const blocked = new Set<string>();
  for (const row of rows) {
    if (!row.externalRef) continue;
    for (const candidate of candidates) {
      if (
        row.userId === candidate.userId &&
        row.projectId === candidate.projectId &&
        row.externalRef.startsWith(candidate.intentPrefix)
      ) {
        blocked.add(candidate.id);
      }
    }
  }
  return blocked;
}

/**
 * Run-start preflight defense. Read the newest whole-book attempt regardless
 * of state so an older terminal lineage cannot supersede a currently active
 * or completed run. Only the terminal candidate rule above can block.
 */
export async function projectHasUnresolvedMetering(input: {
  projectId: string;
  userId: string;
}): Promise<boolean> {
  const [latestRun] = await getDb()
    .select({
      id: schema.generationRuns.id,
      projectId: schema.generationRuns.projectId,
      userId: schema.generationRuns.userId,
      status: schema.generationRuns.status,
      config: schema.generationRuns.config,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, input.projectId),
        eq(schema.generationRuns.userId, input.userId),
        eq(schema.generationRuns.kind, "full_book"),
      ),
    )
    .orderBy(desc(schema.generationRuns.createdAt))
    .limit(1);
  if (!latestRun) return false;
  return (await findRunsWithUnresolvedMetering([latestRun])).has(latestRun.id);
}

const GENERATION_INTENT_LINEAGE = /^metering-intent:generation:([0-9a-f-]{36}):/i;

export async function isMeteringIntentResolved(intentRef: string): Promise<boolean> {
  if (!intentRef.startsWith("metering-intent:")) return false;
  const [terminal] = await getDb()
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(
      or(
        eq(schema.creditLedger.externalRef, `intent-settled:${intentRef}`),
        eq(schema.creditLedger.externalRef, `intent-aborted:${intentRef}`),
      ),
    )
    .limit(1);
  return Boolean(terminal);
}

/**
 * A successful operator reconciliation writes the terminal ledger marker
 * first. Only then may its derived blocking incidents be resolved, and only
 * for runs in that exact logical billing lineage. A remaining open intent
 * keeps every incident in place.
 */
export async function resolveReconciledMeteringIncidents(intentRef: string): Promise<number> {
  const lineageRunId = GENERATION_INTENT_LINEAGE.exec(intentRef)?.[1];
  if (!lineageRunId) return 0;
  const db = getDb();
  const [intent] = await db
    .select({
      projectId: schema.creditLedger.projectId,
      userId: schema.creditLedger.userId,
    })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.externalRef, intentRef))
    .limit(1);
  if (!intent?.projectId) return 0;

  const lineageRuns = await db
    .select({
      id: schema.generationRuns.id,
      projectId: schema.generationRuns.projectId,
      userId: schema.generationRuns.userId,
      status: schema.generationRuns.status,
      config: schema.generationRuns.config,
    })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, intent.projectId),
        eq(schema.generationRuns.userId, intent.userId),
        or(
          eq(schema.generationRuns.id, lineageRunId),
          sql`${schema.generationRuns.config}->>'billingLineageRunId' = ${lineageRunId}`,
        ),
      ),
    );
  if (lineageRuns.length === 0) return 0;

  const stillBlocked = await findRunsWithUnresolvedMetering(lineageRuns);
  const resolvedRuns = lineageRuns.filter((run) => !stillBlocked.has(run.id));
  await Promise.all(
    resolvedRuns.map((run) =>
      resolveAuthoringIncident({ runId: run.id, dedupeKey: "unresolved-metering" }),
    ),
  );
  return resolvedRuns.length;
}

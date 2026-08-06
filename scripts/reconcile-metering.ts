/**
 * Releases the credit holds of provider calls whose outcome is permanently
 * ambiguous, so a project blocked on them can start again.
 *
 * When a provider call is rejected after dispatch, `metered()` deliberately
 * leaves its intent and hold open (src/ai/metering.ts, "Keep the claim and
 * intent pending for operator reconciliation against the unique Gateway
 * attempt tag"). Once the owning run is terminal that is no longer a call in
 * flight, it is an open question about money, and
 * `getAuthoringStartSafetyBlock` refuses to start any new run for the project
 * until it is answered. Correctly — a replacement run reuses the same logical
 * billing key and could repeat a charge we cannot account for.
 *
 * Nothing answers it today. `recommendAdminRunAction` can return
 * "reconcile_metering", but no code implements it, so an author whose run died
 * mid-call is stuck permanently. This is that missing answer, as an operator
 * tool rather than an automated sweep, because the decision is a judgement
 * about money and needs a human to make it.
 *
 * It only ever ABORTS: the hold goes back to the author. If the Gateway did
 * bill the attempt, the business absorbs the provider cost. That is the right
 * direction — an ambiguous call must never be charged to the author — but it
 * IS a real decision, which is why this refuses to run on a large balance
 * without an explicit override, and why it prints the evidence first.
 *
 * It cannot settle. Settling requires the true usage, which by definition we
 * do not have for these attempts; that needs the Gateway's own record.
 *
 *   pnpm exec dotenv -e .env.local -- pnpm exec tsx --tsconfig scripts/tsconfig.json \
 *     scripts/reconcile-metering.ts <runId> [--abort] [--max-credits N]
 *
 * Without --abort it prints what it found and writes nothing.
 */
import { eq } from "drizzle-orm";

import { getDb, getSqlClient, schema } from "../src/db";
import { abortMeteredCallIntent } from "../src/lib/billing/meter";
import type { GenerationConfig } from "../src/lib/run-events";

/** Above this, an operator has to say so explicitly. */
const DEFAULT_MAX_CREDITS = 5;

type OpenIntent = { ref: string; held: number; createdAt: Date };

async function main() {
  const runId = process.argv[2];
  const abort = process.argv.includes("--abort");
  const maxIndex = process.argv.indexOf("--max-credits");
  const maxCredits = maxIndex >= 0 ? Number(process.argv[maxIndex + 1]) : DEFAULT_MAX_CREDITS;
  if (!runId) throw new Error("Usage: reconcile-metering.ts <runId> [--abort] [--max-credits N]");

  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.generationRuns)
    .where(eq(schema.generationRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("Run not found");
  if (run.status !== "failed" && run.status !== "cancelled") {
    // A pending intent on a live run is a call in flight, not a stuck one.
    throw new Error(
      `Refusing: run status is "${run.status}". Only a failed or cancelled run has intents that can no longer resolve themselves.`,
    );
  }

  // The gate keys off the billing LINEAGE, not the run id: a retry inherits its
  // predecessor's logical billing key, and the intents may sit under that.
  const config = run.config as GenerationConfig;
  const lineage = config.billingLineageRunId ?? run.id;
  const prefix = `metering-intent:generation:${lineage}:`;

  const sql = getSqlClient();
  const rows = (await sql`
    select intent.external_ref as ref, (-claim.amount)::float8 as held,
           intent.created_at as "createdAt"
    from credit_ledger intent
    join credit_ledger claim
      on claim.external_ref = 'metering-claim:' || intent.external_ref
     and claim.user_id = intent.user_id
     and claim.kind = 'adjustment'
     and claim.amount < 0
    where intent.kind = 'adjustment'
      and intent.amount = 0
      and intent.user_id = ${run.userId}
      and intent.project_id = ${run.projectId}
      and intent.external_ref like ${`${prefix}%`}
      and not exists (
        select 1 from credit_ledger terminal
        where terminal.external_ref in (
          'intent-settled:' || intent.external_ref,
          'intent-aborted:' || intent.external_ref
        )
      )
    order by intent.created_at
  `) as unknown as OpenIntent[];

  console.log(`run ${run.id} (${run.status}), billing lineage ${lineage}`);
  if (rows.length === 0) {
    console.log("No unresolved intents. This project is not blocked on metering.");
    return;
  }

  const total = rows.reduce((sum, row) => sum + row.held, 0);
  console.log(`\n${rows.length} unresolved intent(s), holding ${total.toFixed(4)} credits:`);
  for (const row of rows) {
    console.log(
      `  ${row.held.toFixed(4)}  ${row.ref.slice(prefix.length)}  @${new Date(row.createdAt).toISOString()}`,
    );
  }

  // Context, not proof: llm_calls has no attempt id, so a recorded call cannot
  // be tied to a specific open intent. It still tells an operator whether this
  // operation ever produced usage at all.
  const usage = (await sql`
    select operation, count(*)::int as calls
    from llm_calls where run_id = ${run.id} group by operation order by operation
  `) as unknown as { operation: string; calls: number }[];
  console.log("\nrecorded provider usage for this run (context only):");
  for (const row of usage) console.log(`  ${row.calls}x ${row.operation}`);

  if (!abort) {
    console.log(
      `\nDRY RUN — nothing written. Re-run with --abort to release ${total.toFixed(4)} credits to the author.`,
    );
    return;
  }
  if (total > maxCredits) {
    throw new Error(
      `Refusing to abort ${total.toFixed(4)} credits without an explicit ceiling: pass --max-credits ${Math.ceil(total)} if that is intended.`,
    );
  }

  for (const row of rows) {
    await abortMeteredCallIntent({
      userId: run.userId,
      intentRef: row.ref,
      // Deterministic: meter.ts derives the hold's ref the same way.
      reservationRef: `metering-claim:${row.ref}`,
      projectId: run.projectId,
      runId: run.id,
    });
    console.log(`  aborted ${row.held.toFixed(4)}  ${row.ref.slice(prefix.length)}`);
  }
  console.log(
    `\nReleased ${total.toFixed(4)} credits. The project can start a new run once its own state allows it.`,
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);

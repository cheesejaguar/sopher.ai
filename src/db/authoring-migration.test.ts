import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0014_petite_maelstrom.sql"), "utf8");
const activeProjectionBackfill = readFileSync(
  join(process.cwd(), "drizzle", "0015_truthful_active_projection.sql"),
  "utf8",
);

describe("authoring hardening migration", () => {
  it("backfills historical progress, attempts, event allocation, and support references", () => {
    expect(migration).toContain("WITH latest_stage AS");
    expect(migration).toContain(`WHEN 'completed' THEN 'done'`);
    expect(migration).toContain(`SET "dispatch_attempts" = 1`);
    expect(migration).not.toContain(`WHERE "kind" <> 'export'`);
    expect(migration).toContain(`SET "next_event_seq" = coalesce`);
    expect(migration).toContain(`ADD COLUMN "support_reference" uuid;`);
    expect(migration).toContain(`SET "support_reference" = gen_random_uuid()`);
    expect(migration.indexOf(`SET "support_reference" = gen_random_uuid()`)).toBeLessThan(
      migration.indexOf(`ALTER COLUMN "support_reference" SET NOT NULL`),
    );
  });

  it("creates composite ownership keys before their foreign keys", () => {
    expect(migration.indexOf(`CREATE UNIQUE INDEX "uq_runs_id_project"`)).toBeLessThan(
      migration.indexOf(`ADD CONSTRAINT "authoring_incidents_run_project_generation_runs_fk"`),
    );
    expect(migration.indexOf(`CREATE UNIQUE INDEX "uq_runs_id_user"`)).toBeLessThan(
      migration.indexOf(`ADD CONSTRAINT "authoring_stream_leases_run_user_generation_runs_fk"`),
    );
  });

  it("repairs no-event active rows in a forward-only migration", () => {
    expect(migration).not.toContain("active_without_recognized_stage");
    expect(activeProjectionBackfill).toContain("WITH active_without_recognized_stage AS");
    expect(activeProjectionBackfill).toContain(`run."status" IN ('running', 'awaiting_input')`);
    expect(activeProjectionBackfill).toContain(`AND NOT EXISTS (`);
    expect(activeProjectionBackfill).toContain(`event."type" = 'stage'`);
    expect(activeProjectionBackfill).toContain(`WHEN 'chapter' THEN 'chapters'`);
    expect(activeProjectionBackfill).toContain(`WHEN 'edit_pass' THEN 'editing'`);
    expect(activeProjectionBackfill).toContain(`WHEN 'continuity' THEN 'continuity'`);
    expect(activeProjectionBackfill).toContain(`WHEN 'export' THEN 'finalizing'`);
    expect(activeProjectionBackfill).toContain(`ELSE 'concept'`);
    expect(activeProjectionBackfill).toContain(`"progress_pct" = greatest(run."progress_pct", 1)`);
    expect(activeProjectionBackfill).toContain(`run."current_stage" = 'queued'`);
    expect(activeProjectionBackfill).toContain(`run."progress_pct" = 0`);
    expect(activeProjectionBackfill).toContain(
      "Production is waiting for author input; the exact request was not recorded before durable tracking was enabled.",
    );
    expect(activeProjectionBackfill).not.toContain(`"pause_kind" =`);
    expect(activeProjectionBackfill).not.toContain(`"pause_details" =`);
    expect(activeProjectionBackfill).not.toContain(`WHEN 'awaiting_input' THEN 'awaiting_credits'`);
  });

  it("enforces bounded authoritative state at the database layer", () => {
    for (const constraint of [
      "generation_runs_progress_pct_check",
      "generation_runs_dispatch_attempts_check",
      "generation_runs_pause_version_check",
      "generation_runs_next_event_seq_check",
      "generation_events_seq_check",
      "authoring_run_inputs_status_check",
      "authoring_incidents_occurrence_count_check",
      "authoring_stream_leases_expiry_check",
    ]) {
      expect(migration).toContain(constraint);
    }
    expect(migration).toContain(
      `"generation_runs_dispatch_attempts_check" CHECK ("generation_runs"."dispatch_attempts" between 0 and 3)`,
    );
  });
});

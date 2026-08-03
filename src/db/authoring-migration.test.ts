import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0014_petite_maelstrom.sql"), "utf8");

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

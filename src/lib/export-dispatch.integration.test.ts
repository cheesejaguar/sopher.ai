import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { reconcileLinkedExportWorkflow, type ExportDispatchSnapshot } from "@/lib/export-dispatch";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  if (isolated !== "1" && !value) return null;
  if (isolated !== "1" || !value || process.env.NODE_ENV === "production") {
    throw new Error("Export reconciliation tests require a disposable isolated database.");
  }
  const parsed = new URL(value);
  const allowedHost = process.env.E2E_DATABASE_HOST?.trim();
  if (!allowedHost || parsed.hostname !== allowedHost) {
    throw new Error("E2E_DATABASE_HOST must match the disposable export-test database.");
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

describeIsolated("export reconciliation against isolated Neon", () => {
  const suffix = randomUUID();
  const userId = `e2e-export-reconcile-${suffix}`;
  const projectId = randomUUID();
  let observer: ReturnType<typeof neon>;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Disposable database URL disappeared.");
    process.env.DATABASE_URL = databaseUrl;
    observer = neon(databaseUrl);
    await observer`
      insert into users (id, email)
      values (${userId}, ${`${userId}@example.test`})
    `;
    await observer`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings, status
      ) values (
        ${projectId}, ${userId}, 'Export reconciliation fixture',
        'A disposable manuscript export reconciliation fixture.',
        'mystery', 'full_book', 1, 1000, '{}'::jsonb, 'editing'
      )
    `;
  });

  beforeEach(async () => {
    await observer`delete from generation_runs where project_id = ${projectId}`;
    await observer`delete from assets where project_id = ${projectId}`;
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id = ${userId}`;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  async function createRun(input?: {
    missingCount?: number;
    missingSince?: Date | null;
  }): Promise<ExportDispatchSnapshot> {
    const id = randomUUID();
    const workflowRunId = `workflow-export-${randomUUID()}`;
    await observer`
      insert into generation_runs (
        id, project_id, user_id, kind, status, config, workflow_run_id,
        workflow_missing_count, workflow_missing_since, started_at
      ) values (
        ${id}, ${projectId}, ${userId}, 'export', 'running',
        '{"format":"md"}'::jsonb, ${workflowRunId},
        ${input?.missingCount ?? 0}, ${input?.missingSince ?? null}, now()
      )
    `;
    return {
      id,
      projectId,
      userId,
      kind: "export",
      status: "running",
      config: { format: "md" },
      workflowRunId,
      acceptanceUncertainAt: null,
      acceptanceDispatchClaimedAt: null,
      dispatchAttempts: 1,
      workflowMissingCount: input?.missingCount ?? 0,
      workflowMissingSince: input?.missingSince ?? null,
    };
  }

  async function statusOf(runId: string) {
    const [row] = (await observer`
      select status, error, workflow_observed_status, workflow_missing_count, completed_at
      from generation_runs where id = ${runId}
    `) as unknown as Array<{
      status: string;
      error: string | null;
      workflow_observed_status: string | null;
      workflow_missing_count: number;
      completed_at: string | null;
    }>;
    return row;
  }

  it("repairs a lost completion when the saved export asset exists", async () => {
    const run = await createRun();
    await observer`
      insert into assets (
        project_id, kind, blob_url, blob_pathname, content_type, size_bytes, meta
      ) values (
        ${projectId}, 'export_md', 'https://example.invalid/export.md',
        ${`exports/${run.id}.md`}, 'text/markdown', 128,
        jsonb_build_object('runId', ${run.id}::text, 'filename', 'fixture.md')
      )
    `;

    await expect(
      reconcileLinkedExportWorkflow(run, {
        readWorkflow: async () => ({
          status: "completed",
          startedAt: new Date(),
          completedAt: new Date(),
        }),
      }),
    ).resolves.toBe("completed");
    expect(await statusOf(run.id)).toMatchObject({
      status: "completed",
      error: null,
      workflow_observed_status: "completed",
      workflow_missing_count: 0,
    });
    expect((await statusOf(run.id)).completed_at).not.toBeNull();
  });

  it("fails a remotely completed export that has no persisted file", async () => {
    const run = await createRun();
    await expect(
      reconcileLinkedExportWorkflow(run, {
        readWorkflow: async () => ({
          status: "completed",
          startedAt: new Date(),
          completedAt: new Date(),
        }),
      }),
    ).resolves.toBe("failed");
    expect(await statusOf(run.id)).toMatchObject({
      status: "failed",
      error: "The export Workflow completed without a saved export file",
      workflow_observed_status: "completed",
    });
  });

  it("preserves one missing observation but terminalizes conclusive absence", async () => {
    const first = await createRun();
    await expect(
      reconcileLinkedExportWorkflow(first, {
        readWorkflow: async () => ({ status: "missing", startedAt: null, completedAt: null }),
      }),
    ).resolves.toBe("unchanged");
    expect(await statusOf(first.id)).toMatchObject({
      status: "running",
      workflow_observed_status: "missing",
      workflow_missing_count: 1,
    });

    const conclusive = await createRun({
      missingCount: 2,
      missingSince: new Date(Date.now() - 11 * 60_000),
    });
    await expect(
      reconcileLinkedExportWorkflow(conclusive, {
        readWorkflow: async () => ({ status: "missing", startedAt: null, completedAt: null }),
      }),
    ).resolves.toBe("failed");
    expect(await statusOf(conclusive.id)).toMatchObject({
      status: "failed",
      workflow_observed_status: "missing",
      workflow_missing_count: 3,
    });
  });
});

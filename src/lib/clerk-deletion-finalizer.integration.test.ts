import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const workflowMocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  start: vi.fn(),
}));

vi.mock("workflow/api", () => ({
  getRun: vi.fn(() => ({
    exists: Promise.resolve(true),
    status: Promise.resolve("cancelled"),
    startedAt: Promise.resolve(new Date("2026-07-30T12:00:00.000Z")),
    completedAt: Promise.resolve(new Date("2026-07-30T12:01:00.000Z")),
    cancel: workflowMocks.cancel,
  })),
  start: workflowMocks.start,
}));

import { requestDeletedClerkUserRunCancellations } from "@/lib/clerk-deletion-finalizer";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  const requested = isolated === "1" || Boolean(value);
  if (!requested) return null;
  if (isolated !== "1" || !value) {
    throw new Error(
      "Clerk deletion finalizer tests require E2E_DATABASE_ISOLATED=1 and E2E_DATABASE_URL.",
    );
  }
  const parsed = new URL(value);
  if (
    process.env.NODE_ENV === "production" ||
    !process.env.E2E_DATABASE_HOST ||
    parsed.hostname !== process.env.E2E_DATABASE_HOST
  ) {
    throw new Error(
      "Clerk deletion finalizer tests require the explicitly allowed disposable Neon host.",
    );
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

describeIsolated("deleted Clerk user run finalization against isolated Neon", () => {
  const userId = `e2e-clerk-delete-${randomUUID()}`;
  const projectId = randomUUID();
  const runId = randomUUID();
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let observer: ReturnType<typeof neon> | null = null;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Disposable database URL disappeared.");
    process.env.DATABASE_URL = databaseUrl;
    observer = neon(databaseUrl);
    workflowMocks.cancel.mockResolvedValue(undefined);
    workflowMocks.start.mockResolvedValue({ runId: "cleanup-run" });
    await observer`
      insert into users (id, email)
      values (${userId}, ${`${userId}@example.test`})
    `;
    await observer`
      insert into projects (
        id, user_id, title, brief, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, 'Paused deletion fixture',
        'A disposable deletion fixture.', 'full_book',
        3, 1000, '{}'::jsonb
      )
    `;
    await observer`
      insert into generation_runs (
        id, project_id, user_id, workflow_run_id, kind, status, config,
        current_stage, progress_pct, pause_kind, pause_version,
        pause_registered_at, started_at
      )
      values (
        ${runId}, ${projectId}, ${userId}, 'workflow-paused-delete',
        'full_book', 'awaiting_input', '{"protocolVersion":2}'::jsonb,
        'awaiting_approval', 18, 'outline_approval', 1, now(), now()
      )
    `;
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id = ${userId}`;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("cancels and terminalizes an input pause that can no longer receive author input", async () => {
    await expect(requestDeletedClerkUserRunCancellations(userId)).resolves.toBe(1);

    expect(workflowMocks.cancel).toHaveBeenCalledOnce();
    const [row] = (await observer!`
        select status, cancellation_requested_at, cancellation_reason
        from generation_runs
        where id = ${runId}
      `) as Array<{
      status: string;
      cancellation_requested_at: string | null;
      cancellation_reason: string | null;
    }>;
    expect(row).toMatchObject({
      status: "cancelled",
      cancellation_reason: "Clerk account deleted",
    });
    expect(row?.cancellation_requested_at).toBeTruthy();
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  linkWorkflow: vi.fn(),
  markUncertain: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});

vi.mock("@/lib/generation-runs", () => ({
  linkAuthoringRunWorkflow: mocks.linkWorkflow,
  markAuthoringRunAcceptanceUncertain: mocks.markUncertain,
}));

vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("@/workflows/export", () => ({ exportBook: vi.fn() }));

import {
  dispatchExportWorkflow,
  exportDispatchRecoveryAction,
  reconcileLinkedExportWorkflow,
  type ExportDispatchSnapshot,
} from "@/lib/export-dispatch";

const now = new Date("2026-07-30T12:10:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.markUncertain.mockResolvedValue(true);
});

function run(overrides: Partial<ExportDispatchSnapshot> = {}): ExportDispatchSnapshot {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    projectId: "22222222-2222-4222-8222-222222222222",
    userId: "user-1",
    kind: "export",
    status: "queued",
    config: { format: "pdf" },
    workflowRunId: null,
    acceptanceUncertainAt: null,
    acceptanceDispatchClaimedAt: new Date("2026-07-30T12:09:55.000Z"),
    dispatchAttempts: 1,
    ...overrides,
  };
}

describe("export dispatch recovery", () => {
  it("waits while the initial dispatch lease can still self-link", () => {
    expect(exportDispatchRecoveryAction(run(), now)).toBe("wait");
  });

  it("redispatches the same durable run after the lease expires", () => {
    expect(
      exportDispatchRecoveryAction(
        run({
          acceptanceUncertainAt: new Date("2026-07-30T12:07:00.000Z"),
          acceptanceDispatchClaimedAt: new Date("2026-07-30T12:07:00.000Z"),
        }),
        now,
      ),
    ).toBe("redispatch");
  });

  it("fails only after three expired zero-link dispatch attempts", () => {
    expect(
      exportDispatchRecoveryAction(
        run({
          acceptanceUncertainAt: new Date("2026-07-30T12:07:00.000Z"),
          acceptanceDispatchClaimedAt: new Date("2026-07-30T12:07:00.000Z"),
          dispatchAttempts: 3,
        }),
        now,
      ),
    ).toBe("fail");
  });

  it("never redispatches a linked, running, or non-export run", () => {
    expect(exportDispatchRecoveryAction(run({ workflowRunId: "workflow-1" }), now)).toBe("none");
    expect(exportDispatchRecoveryAction(run({ status: "running" }), now)).toBe("none");
    expect(exportDispatchRecoveryAction(run({ kind: "full_book" }), now)).toBe("none");
  });

  it("preserves an ambiguous start response instead of terminalizing the export", async () => {
    mocks.start.mockRejectedValue(new Error("response lost"));
    const snapshot = run();

    await expect(
      dispatchExportWorkflow({
        runId: snapshot.id,
        projectId: snapshot.projectId,
        userId: snapshot.userId,
        format: "pdf",
      }),
    ).resolves.toEqual({ outcome: "acceptance_uncertain", workflowRunId: null });

    expect(mocks.markUncertain).toHaveBeenCalledWith({
      runId: snapshot.id,
      projectId: snapshot.projectId,
      userId: snapshot.userId,
      format: "pdf",
    });
  });

  it("treats caller-side linkage as redundant proof of acceptance", async () => {
    mocks.start.mockResolvedValue({ runId: "workflow-1" });
    mocks.linkWorkflow.mockResolvedValue(true);
    const snapshot = run();

    await expect(
      dispatchExportWorkflow({
        runId: snapshot.id,
        projectId: snapshot.projectId,
        userId: snapshot.userId,
        format: "pdf",
      }),
    ).resolves.toEqual({ outcome: "started", workflowRunId: "workflow-1" });
    expect(mocks.markUncertain).not.toHaveBeenCalled();
  });

  it("self-links before the export workflow enters failure-handling or byte production", () => {
    const source = readFileSync(resolve(process.cwd(), "src/workflows/export.ts"), "utf8");
    const workflowStart = source.indexOf("export async function exportBook(");
    const workflow = source.slice(workflowStart);
    const selfLink = workflow.indexOf("await linkExportWorkflowStep(ref, workflowRunId)");
    const guardedTry = workflow.indexOf("try {");
    const upload = workflow.indexOf("assembleAndUploadStep(");

    expect(selfLink).toBeGreaterThan(0);
    expect(guardedTry).toBeGreaterThan(selfLink);
    expect(upload).toBeGreaterThan(guardedTry);
  });

  it("repairs a lost completed transition only when the saved export asset exists", async () => {
    const snapshot = run({ status: "running", workflowRunId: "workflow-1" });
    const transition = vi.fn(async () => true);
    const observeWorkflow = vi.fn(async () => ({
      status: "completed" as const,
      missingCount: 0,
      missingSince: null,
    }));

    await expect(
      reconcileLinkedExportWorkflow(snapshot, {
        readWorkflow: vi.fn(async () => ({
          status: "completed" as const,
          startedAt: now,
          completedAt: now,
        })),
        observeWorkflow,
        hasSavedAsset: vi.fn(async () => true),
        transition,
      }),
    ).resolves.toBe("completed");
    expect(transition).toHaveBeenCalledWith(snapshot, "completed", null);
  });

  it("fails a completed Workflow whose immutable export file is missing", async () => {
    const snapshot = run({ status: "running", workflowRunId: "workflow-1" });
    const transition = vi.fn(async () => true);

    await expect(
      reconcileLinkedExportWorkflow(snapshot, {
        readWorkflow: vi.fn(async () => ({
          status: "completed" as const,
          startedAt: now,
          completedAt: now,
        })),
        observeWorkflow: vi.fn(async () => ({
          status: "completed" as const,
          missingCount: 0,
          missingSince: null,
        })),
        hasSavedAsset: vi.fn(async () => false),
        transition,
      }),
    ).resolves.toBe("failed");
    expect(transition).toHaveBeenCalledWith(
      snapshot,
      "failed",
      "The export Workflow completed without a saved export file",
    );
  });

  it.each(["failed", "cancelled"] as const)(
    "repairs a remotely %s linked export",
    async (workflowStatus) => {
      const snapshot = run({ status: "running", workflowRunId: "workflow-1" });
      const transition = vi.fn(async () => true);
      await expect(
        reconcileLinkedExportWorkflow(snapshot, {
          readWorkflow: vi.fn(async () => ({
            status: workflowStatus,
            startedAt: now,
            completedAt: now,
          })),
          observeWorkflow: vi.fn(async () => ({
            status: workflowStatus,
            missingCount: 0,
            missingSince: null,
          })),
          hasSavedAsset: vi.fn(async () => false),
          transition,
        }),
      ).resolves.toBe(workflowStatus);
      expect(transition).toHaveBeenCalledWith(
        snapshot,
        workflowStatus,
        workflowStatus === "failed"
          ? "The export Workflow stopped before the file was saved"
          : null,
      );
    },
  );

  it("preserves unavailable and inconclusively missing Workflows", async () => {
    const snapshot = run({ status: "running", workflowRunId: "workflow-1" });
    const transition = vi.fn(async () => true);
    for (const workflowStatus of ["unavailable", "missing"] as const) {
      await expect(
        reconcileLinkedExportWorkflow(snapshot, {
          readWorkflow: vi.fn(async () => ({
            status: workflowStatus,
            startedAt: null,
            completedAt: null,
          })),
          observeWorkflow: vi.fn(async () => ({
            status: workflowStatus,
            missingCount: workflowStatus === "missing" ? 1 : 0,
            missingSince: workflowStatus === "missing" ? now : null,
          })),
          hasSavedAsset: vi.fn(async () => false),
          transition,
        }),
      ).resolves.toBe("unchanged");
    }
    expect(transition).not.toHaveBeenCalled();
  });

  it("terminalizes only after conclusive missing observations, recovering a saved asset", async () => {
    const snapshot = run({ status: "running", workflowRunId: "workflow-1" });
    const transition = vi.fn(async () => true);
    await expect(
      reconcileLinkedExportWorkflow(snapshot, {
        readWorkflow: vi.fn(async () => ({
          status: "missing" as const,
          startedAt: null,
          completedAt: null,
        })),
        observeWorkflow: vi.fn(async () => ({
          status: "missing" as const,
          missingCount: 3,
          missingSince: new Date(Date.now() - 11 * 60_000),
        })),
        hasSavedAsset: vi.fn(async () => true),
        transition,
      }),
    ).resolves.toBe("completed");
    expect(transition).toHaveBeenCalledWith(snapshot, "completed", null);
  });
});

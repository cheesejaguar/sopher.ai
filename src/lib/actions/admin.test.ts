import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  redispatch: vi.fn(),
  redeliver: vi.fn(),
  recordIncident: vi.fn(),
  resolveIncident: vi.fn(),
  requestCancellation: vi.fn(),
  scheduleCleanup: vi.fn(),
  reconcileRun: vi.fn(),
  getWorkflowRun: vi.fn(),
  cancelWorkflow: vi.fn(),
  reconcileCharged: vi.fn(),
  reconcileUncharged: vi.fn(),
  resolveReconciledIncidents: vi.fn(),
  isMeteringIntentResolved: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return {
    ...actual,
    getDb: mocks.getDb,
  };
});

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/authoring-dispatch", () => ({
  redispatchUncertainAuthoringRun: mocks.redispatch,
}));

vi.mock("@/lib/authoring-inputs", () => ({
  redeliverAcceptedAuthoringRunInput: mocks.redeliver,
}));

vi.mock("@/lib/authoring-incidents", () => ({
  recordAuthoringIncident: mocks.recordIncident,
  resolveAuthoringIncident: mocks.resolveIncident,
}));

vi.mock("@/lib/billing/credits", () => ({
  grantCredits: vi.fn(),
}));

vi.mock("@/lib/billing/meter", () => ({
  reconcileMeteredCallAsCharged: mocks.reconcileCharged,
  reconcileMeteredCallAsUncharged: mocks.reconcileUncharged,
}));

vi.mock("@/lib/billing/unresolved-metering", () => ({
  isMeteringIntentResolved: mocks.isMeteringIntentResolved,
  resolveReconciledMeteringIncidents: mocks.resolveReconciledIncidents,
}));

vi.mock("@/lib/generation-runs", () => ({
  requestAuthoringRunCancellation: mocks.requestCancellation,
  scheduleRunReservationCleanup: mocks.scheduleCleanup,
}));

vi.mock("@/lib/run-health", () => ({
  reconcileAuthoringRun: mocks.reconcileRun,
}));

vi.mock("workflow/api", () => ({
  getRun: mocks.getWorkflowRun,
}));

import {
  adminCancelRun,
  adminReconcileChargedMeteringIntent,
  adminReconcileUnchargedMeteringIntent,
  adminRecheckRun,
  adminRedeliverRunInput,
  adminRedispatchRun,
} from "@/lib/actions/admin";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const INPUT_ID = "33333333-3333-4333-8333-333333333333";

function selectRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const tail = {
    where,
    innerJoin: vi.fn().mockReturnValue({ where }),
  };
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue(tail),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ userId: "admin-1" });
  mocks.recordIncident.mockResolvedValue(undefined);
  mocks.resolveIncident.mockResolvedValue(undefined);
  mocks.scheduleCleanup.mockResolvedValue(undefined);
  mocks.cancelWorkflow.mockResolvedValue(undefined);
  mocks.reconcileCharged.mockResolvedValue(undefined);
  mocks.reconcileUncharged.mockResolvedValue(true);
  mocks.resolveReconciledIncidents.mockResolvedValue(1);
  mocks.isMeteringIntentResolved.mockResolvedValue(false);
  mocks.getWorkflowRun.mockReturnValue({ cancel: mocks.cancelWorkflow });
  mocks.reconcileRun.mockResolvedValue({
    runId: RUN_ID,
    outcome: "unchanged",
    workflowStatus: "running",
  });
});

describe("Admin authoring recovery actions", () => {
  it("forwards cancellation to the Workflow id returned under the cancellation lock", async () => {
    mocks.getDb.mockReturnValue(
      selectRows([
        {
          id: RUN_ID,
          status: "running",
          projectId: PROJECT_ID,
          userId: "author-1",
          workflowRunId: "workflow-stale",
        },
      ]),
    );
    mocks.requestCancellation.mockResolvedValue({
      runId: RUN_ID,
      projectId: PROJECT_ID,
      userId: "author-1",
      workflowRunId: "workflow-current",
      status: "running",
      requested: true,
    });

    await expect(adminCancelRun(RUN_ID)).resolves.toBeUndefined();

    expect(mocks.getWorkflowRun).toHaveBeenCalledWith("workflow-current");
    expect(mocks.getWorkflowRun).not.toHaveBeenCalledWith("workflow-stale");
    expect(mocks.cancelWorkflow).toHaveBeenCalledOnce();
    expect(mocks.scheduleCleanup).toHaveBeenCalledWith({
      userId: "author-1",
      runId: RUN_ID,
    });
    expect(mocks.recordIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        projectId: PROJECT_ID,
        category: "operator_action",
        evidence: {
          action: "request_cancellation",
          actorId: "admin-1",
          outcome: "requested_workflow_notified",
        },
      }),
    );
    expect(mocks.resolveIncident).toHaveBeenCalledWith({
      runId: RUN_ID,
      dedupeKey: expect.stringMatching(/^operator:request_cancellation:/),
    });
  });

  it("audits a fresh evidence recheck with the reconciliation result", async () => {
    const run = { id: RUN_ID, projectId: PROJECT_ID, userId: "author-1" };
    mocks.getDb.mockReturnValue(selectRows([run]));
    mocks.reconcileRun.mockResolvedValue({
      runId: RUN_ID,
      outcome: "completed",
      workflowStatus: "completed",
    });

    await expect(adminRecheckRun(RUN_ID)).resolves.toBeUndefined();

    expect(mocks.reconcileRun).toHaveBeenCalledWith(run);
    expect(mocks.recordIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        projectId: PROJECT_ID,
        category: "operator_action",
        evidence: {
          action: "recheck",
          actorId: "admin-1",
          outcome: "completed:completed",
        },
      }),
    );
    expect(mocks.resolveIncident).toHaveBeenCalledWith({
      runId: RUN_ID,
      dedupeKey: expect.stringMatching(/^operator:recheck:/),
    });
  });

  it("audits a cancellation request that is refused because the run is already terminal", async () => {
    mocks.getDb.mockReturnValue(
      selectRows([
        {
          id: RUN_ID,
          status: "completed",
          projectId: PROJECT_ID,
          userId: "author-1",
          workflowRunId: "workflow-complete",
        },
      ]),
    );

    await expect(adminCancelRun(RUN_ID)).resolves.toBeUndefined();

    expect(mocks.requestCancellation).not.toHaveBeenCalled();
    expect(mocks.recordIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: {
          action: "request_cancellation",
          actorId: "admin-1",
          outcome: "already_terminal",
        },
      }),
    );
  });

  it("audits a failed Workflow probe without claiming a terminal result", async () => {
    mocks.getDb.mockReturnValue(
      selectRows([{ id: RUN_ID, projectId: PROJECT_ID, userId: "author-1" }]),
    );
    mocks.reconcileRun.mockRejectedValue(new Error("workflow unavailable"));

    await expect(adminRecheckRun(RUN_ID)).rejects.toThrow("workflow unavailable");

    expect(mocks.recordIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: {
          action: "recheck",
          actorId: "admin-1",
          outcome: "probe_error",
        },
      }),
    );
  });

  it("redispatches the same durable run and writes a content-free operator audit", async () => {
    mocks.getDb.mockReturnValue(
      selectRows([{ id: RUN_ID, projectId: PROJECT_ID, userId: "author-1" }]),
    );
    mocks.redispatch.mockResolvedValue({
      outcome: "started",
      workflowRunId: "workflow-recovered",
    });

    await expect(adminRedispatchRun(RUN_ID)).resolves.toBeUndefined();

    expect(mocks.redispatch).toHaveBeenCalledWith({
      runId: RUN_ID,
      projectId: PROJECT_ID,
      userId: "author-1",
    });
    expect(mocks.recordIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        projectId: PROJECT_ID,
        category: "operator_action",
        evidence: {
          action: "redispatch",
          actorId: "admin-1",
          outcome: "started",
        },
      }),
    );
    expect(mocks.resolveIncident).toHaveBeenCalledWith({
      runId: RUN_ID,
      dedupeKey: expect.stringMatching(/^operator:redispatch:/),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/runs/${RUN_ID}`);
  });

  it("audits an ineligible redispatch but does not imply that recovery started", async () => {
    mocks.getDb.mockReturnValue(
      selectRows([{ id: RUN_ID, projectId: PROJECT_ID, userId: "author-1" }]),
    );
    mocks.redispatch.mockResolvedValue({
      outcome: "not_eligible",
      workflowRunId: null,
    });

    await expect(adminRedispatchRun(RUN_ID)).rejects.toThrow("not eligible for safe redispatch");
    expect(mocks.recordIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: expect.objectContaining({
          action: "redispatch",
          outcome: "not_eligible",
        }),
      }),
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("redelivers only the stored input id and never copies its author payload into audit evidence", async () => {
    mocks.getDb.mockReturnValue(
      selectRows([{ id: INPUT_ID, runId: RUN_ID, projectId: PROJECT_ID }]),
    );
    mocks.redeliver.mockResolvedValue("delivered");

    await expect(adminRedeliverRunInput(INPUT_ID)).resolves.toBeUndefined();

    expect(mocks.redeliver).toHaveBeenCalledWith({
      inputId: INPUT_ID,
      minimumAgeMs: 0,
    });
    const incident = mocks.recordIncident.mock.calls[0]?.[0] as {
      evidence: Record<string, unknown>;
    };
    expect(incident.evidence).toEqual({
      action: "redeliver_input",
      actorId: "admin-1",
      outcome: "delivered",
    });
    expect(incident.evidence).not.toHaveProperty("payload");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/runs/${RUN_ID}`);
  });

  it("audits stale input redelivery evidence and then refuses the mutation", async () => {
    mocks.getDb.mockReturnValue(
      selectRows([{ id: INPUT_ID, runId: RUN_ID, projectId: PROJECT_ID }]),
    );
    mocks.redeliver.mockResolvedValue("not_eligible");

    await expect(adminRedeliverRunInput(INPUT_ID)).rejects.toThrow(
      "no longer eligible for safe redelivery",
    );
    expect(mocks.recordIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: expect.objectContaining({
          action: "redeliver_input",
          outcome: "not_eligible",
        }),
      }),
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("clears only derived blocking incidents after an uncharged intent is resolved", async () => {
    const intentRef = `metering-intent:generation:${RUN_ID}:creative.question:attempt:test`;

    await expect(
      adminReconcileUnchargedMeteringIntent({
        intentRef,
        confirmation: "verified_no_gateway_charge",
        note: "Gateway showed no billable generation for this attempt.",
      }),
    ).resolves.toBeUndefined();

    expect(mocks.reconcileUncharged).toHaveBeenCalledWith({
      intentRef,
      adminId: "admin-1",
      note: "Gateway showed no billable generation for this attempt.",
    });
    expect(mocks.resolveReconciledIncidents).toHaveBeenCalledWith(intentRef);
  });

  it("retries stale incident cleanup after an uncharged ledger reconciliation already committed", async () => {
    const intentRef = `metering-intent:generation:${RUN_ID}:creative.question:attempt:test`;
    mocks.reconcileUncharged.mockResolvedValue(false);
    mocks.isMeteringIntentResolved.mockResolvedValue(true);

    await expect(
      adminReconcileUnchargedMeteringIntent({
        intentRef,
        confirmation: "verified_no_gateway_charge",
        note: "Gateway showed no billable generation for this attempt.",
      }),
    ).resolves.toBeUndefined();

    expect(mocks.isMeteringIntentResolved).toHaveBeenCalledWith(intentRef);
    expect(mocks.resolveReconciledIncidents).toHaveBeenCalledWith(intentRef);
  });

  it("clears only derived blocking incidents after a charged intent is settled", async () => {
    const intentRef = `metering-intent:generation:${RUN_ID}:creative.question:attempt:test`;

    await expect(
      adminReconcileChargedMeteringIntent({
        intentRef,
        confirmation: "verified_gateway_charge",
        note: "Gateway usage was verified against the provider generation.",
        calls: [{ model: "provider/model", inputTokens: 100, outputTokens: 20 }],
      }),
    ).resolves.toBeUndefined();

    expect(mocks.reconcileCharged).toHaveBeenCalledWith({
      intentRef,
      adminId: "admin-1",
      note: "Gateway usage was verified against the provider generation.",
      calls: [
        {
          model: "provider/model",
          inputTokens: 100,
          outputTokens: 20,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          imageCount: 0,
        },
      ],
    });
    expect(mocks.resolveReconciledIncidents).toHaveBeenCalledWith(intentRef);
  });
});

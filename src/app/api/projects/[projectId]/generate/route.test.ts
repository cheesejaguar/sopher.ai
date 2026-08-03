import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
  requestCancellation: vi.fn(),
  scheduleCleanup: vi.fn(),
  getWorkflowRun: vi.fn(),
  cancelWorkflow: vi.fn(),
  assertNotSuspended: vi.fn(),
  reconcile: vi.fn(),
  getSafetyBlock: vi.fn(),
  insertQueued: vi.fn(),
  getOrCreateBook: vi.fn(),
  authorizeProjectSpend: vi.fn(),
  rateLimit: vi.fn(),
  prepareDispatch: vi.fn(),
  startWorkflow: vi.fn(),
}));

vi.mock("workflow/api", () => ({
  start: mocks.startWorkflow,
  getRun: mocks.getWorkflowRun,
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return {
    ...actual,
    getDb: mocks.getDb,
  };
});

vi.mock("@/lib/auth", () => {
  class UnauthorizedError extends Error {}
  class SuspendedError extends Error {}
  return {
    requireUser: mocks.requireUser,
    assertNotSuspended: mocks.assertNotSuspended,
    UnauthorizedError,
    SuspendedError,
  };
});

vi.mock("@/lib/generation-runs", () => {
  class RunRequestKeyMismatchError extends Error {}
  class TrialOptionalWorkInProgressError extends Error {}
  class ProjectStartSnapshotChangedError extends Error {}
  class FullBookStartInsufficientCreditsError extends Error {
    balance = 0;
    required = 0;
  }
  return {
    insertQueuedAuthoringRun: mocks.insertQueued,
    linkAuthoringRunWorkflow: vi.fn(),
    markAuthoringRunAcceptanceUncertain: vi.fn(),
    reconcileBeforeAuthoringRunConflict: mocks.reconcile,
    requestAuthoringRunCancellation: mocks.requestCancellation,
    scheduleRunReservationCleanup: mocks.scheduleCleanup,
    settleStubbedAuthoringRunHandoff: vi.fn(),
    terminalizeAuthoringRun: vi.fn(),
    RunRequestKeyMismatchError,
    ProjectStartSnapshotChangedError,
    TrialOptionalWorkInProgressError,
    FullBookStartInsufficientCreditsError,
  };
});

vi.mock("@/workflows/generate-book", () => ({
  generateBook: vi.fn(),
}));
vi.mock("@/lib/authoring-start-safety", () => ({
  getAuthoringStartSafetyBlock: mocks.getSafetyBlock,
}));
vi.mock("@/db/queries/projects", () => ({
  getOrCreateBook: mocks.getOrCreateBook,
}));
vi.mock("@/lib/project-spend-http", () => ({
  authorizeProjectSpend: mocks.authorizeProjectSpend,
}));
vi.mock("@/lib/security/rate-limit", () => ({
  LIMITS: { bookStart: {} },
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/authoring-dispatch", () => ({
  prepareFullBookRunDispatch: mocks.prepareDispatch,
}));

import { DELETE, POST } from "./route";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

function selectRows(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "author-1" });
  mocks.cancelWorkflow.mockResolvedValue(undefined);
  mocks.getWorkflowRun.mockReturnValue({ cancel: mocks.cancelWorkflow });
  mocks.scheduleCleanup.mockResolvedValue(undefined);
  mocks.assertNotSuspended.mockResolvedValue(undefined);
  mocks.reconcile.mockResolvedValue(undefined);
  mocks.getSafetyBlock.mockResolvedValue(null);
  mocks.authorizeProjectSpend.mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue({ limited: false });
  mocks.getOrCreateBook.mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555" });
});

describe("DELETE project generation", () => {
  it("cancels the Workflow id returned by the locked cancellation request", async () => {
    mocks.getDb.mockReturnValue(
      selectRows([
        {
          id: RUN_ID,
          projectId: PROJECT_ID,
          userId: "author-1",
          status: "running",
          kind: "full_book",
          workflowRunId: "workflow-stale",
        },
      ]),
    );
    mocks.requestCancellation.mockResolvedValue({
      runId: RUN_ID,
      projectId: PROJECT_ID,
      userId: "author-1",
      status: "running",
      workflowRunId: "workflow-current",
      requested: true,
    });

    const response = await DELETE(
      new Request("https://sopher.ai", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: RUN_ID }),
      }),
      {
        params: Promise.resolve({ projectId: PROJECT_ID }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cancelled: false,
      cancellationRequested: true,
    });
    expect(mocks.getWorkflowRun).toHaveBeenCalledWith("workflow-current");
    expect(mocks.getWorkflowRun).not.toHaveBeenCalledWith("workflow-stale");
    expect(mocks.cancelWorkflow).toHaveBeenCalledOnce();
    expect(mocks.scheduleCleanup).toHaveBeenCalledWith({
      userId: "author-1",
      runId: RUN_ID,
    });
    expect(mocks.requestCancellation).toHaveBeenCalledWith({
      runId: RUN_ID,
      projectId: PROJECT_ID,
      userId: "author-1",
      reason: "Cancelled by author",
    });
  });

  it("refuses to cancel a newer run from a stale tab", async () => {
    mocks.requestCancellation.mockResolvedValue(null);

    const response = await DELETE(
      new Request("https://sopher.ai", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: RUN_ID }),
      }),
      {
        params: Promise.resolve({ projectId: PROJECT_ID }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "stale_run" });
    expect(mocks.getWorkflowRun).not.toHaveBeenCalled();
    expect(mocks.scheduleCleanup).not.toHaveBeenCalled();
  });
});

describe("POST project generation safety gate", () => {
  it("retires a terminal request-key replay before evaluating replacement-run safety", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: PROJECT_ID }]) }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: RUN_ID,
                kind: "full_book",
                status: "failed",
                config: { protocolVersion: 2 },
              },
            ]),
          }),
        }),
      });
    mocks.getDb.mockReturnValue({ select });

    const response = await POST(
      new Request("https://sopher.ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey: "33333333-3333-4333-8333-333333333333" }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      runId: RUN_ID,
      kind: "full_book",
      status: "failed",
      code: "terminal_request_replay",
      retryable: true,
    });
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.getSafetyBlock).not.toHaveBeenCalled();
  });

  it("reattaches an active request-key replay without creating another run", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: PROJECT_ID }]) }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: RUN_ID,
                kind: "full_book",
                status: "running",
                config: { protocolVersion: 3 },
              },
            ]),
          }),
        }),
      });
    mocks.getDb.mockReturnValue({ select });

    const response = await POST(
      new Request("https://sopher.ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey: "33333333-3333-4333-8333-333333333333" }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      runId: RUN_ID,
      kind: "full_book",
      status: "running",
      reattached: true,
    });
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.getSafetyBlock).not.toHaveBeenCalled();
  });

  it("does not mark a completed request-key replay safe to retry", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: PROJECT_ID }]) }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([
                { id: RUN_ID, kind: "full_book", status: "completed", config: {} },
              ]),
          }),
        }),
      });
    mocks.getDb.mockReturnValue({ select });

    const response = await POST(
      new Request("https://sopher.ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey: "33333333-3333-4333-8333-333333333333" }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "terminal_request_replay",
      status: "completed",
      retryable: false,
    });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("returns a terminal replay when the request-key insert race loses to a failed row", async () => {
    const project = {
      id: PROJECT_ID,
      userId: "author-1",
      title: "The Clockmaker's Map",
      brief: "A clockmaker follows a map beneath the city.",
      genre: "mystery",
      styleGuide: null,
      experience: "trial_short_story",
      targetChapters: 3,
      targetWordsPerChapter: 1000,
      settings: {},
      updatedAt: new Date("2026-08-03T10:00:00.000Z"),
    };
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([project]) }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue([]) }),
        }),
      });
    mocks.getDb.mockReturnValue({ select });
    mocks.insertQueued.mockResolvedValue({
      id: RUN_ID,
      inserted: false,
      kind: "full_book",
      status: "failed",
      config: { protocolVersion: 3 },
      workflowRunId: null,
    });

    const response = await POST(
      new Request("https://sopher.ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey: "33333333-3333-4333-8333-333333333333" }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "terminal_request_replay",
      status: "failed",
      retryable: true,
    });
    expect(mocks.prepareDispatch).not.toHaveBeenCalled();
    expect(mocks.startWorkflow).not.toHaveBeenCalled();
  });

  it("blocks a new run when fresh authoritative evidence requires support", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: PROJECT_ID }]) }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      });
    mocks.getDb.mockReturnValue({ select });
    mocks.getSafetyBlock.mockResolvedValue({
      code: "support_required",
      supportReference: "SPH-PROJECT-RUN",
      action: {
        kind: "contact_support",
        href: "mailto:support@sopher.ai",
        label: "Contact support",
        description: "The saved run needs a safety recheck.",
        requiresMeteredAccess: false,
      },
    });

    const response = await POST(
      new Request("https://sopher.ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey: "33333333-3333-4333-8333-333333333333" }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "support_required",
      supportReference: "SPH-PROJECT-RUN",
      action: { kind: "contact_support" },
    });
    expect(mocks.reconcile).toHaveBeenCalledWith({ projectId: PROJECT_ID, userId: "author-1" });
  });
});

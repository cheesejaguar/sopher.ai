import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
  assertNotSuspended: vi.fn(),
  rateLimit: vi.fn(),
  authorizeProjectSpend: vi.fn(),
  prepareFullBookRunDispatch: vi.fn(),
  markAuthoringRunDispatchReady: vi.fn(),
  claimUncertainAuthoringRun: vi.fn(),
  linkAuthoringRunWorkflow: vi.fn(),
  markAuthoringRunAcceptanceUncertain: vi.fn(),
  settleStubbedAuthoringRunHandoff: vi.fn(),
  terminalizeAuthoringRun: vi.fn(),
  isE2EWorkflowStubEnabled: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  assertNotSuspended: mocks.assertNotSuspended,
  UnauthorizedError: class UnauthorizedError extends Error {},
  SuspendedError: class SuspendedError extends Error {},
}));

vi.mock("@/lib/security/rate-limit", () => ({
  LIMITS: { bookStart: {} },
  rateLimit: mocks.rateLimit,
}));

vi.mock("@/lib/project-spend-http", () => ({
  authorizeProjectSpend: mocks.authorizeProjectSpend,
}));

vi.mock("@/lib/authoring-dispatch", () => ({
  prepareFullBookRunDispatch: mocks.prepareFullBookRunDispatch,
  markAuthoringRunDispatchReady: mocks.markAuthoringRunDispatchReady,
}));

vi.mock("@/lib/generation-runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation-runs")>();
  return {
    ...actual,
    claimUncertainAuthoringRun: mocks.claimUncertainAuthoringRun,
    linkAuthoringRunWorkflow: mocks.linkAuthoringRunWorkflow,
    markAuthoringRunAcceptanceUncertain: mocks.markAuthoringRunAcceptanceUncertain,
    settleStubbedAuthoringRunHandoff: mocks.settleStubbedAuthoringRunHandoff,
    terminalizeAuthoringRun: mocks.terminalizeAuthoringRun,
  };
});

vi.mock("@/lib/e2e-workflow-stub", () => ({
  isE2EWorkflowStubEnabled: mocks.isE2EWorkflowStubEnabled,
}));

vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("@/workflows/generate-book", () => ({ generateBook: vi.fn() }));
vi.mock("@/workflows/generate-chapter", () => ({ generateChapter: vi.fn() }));

import { POST } from "./route";

const runId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const config = {
  dispatchReady: true as const,
  tier: "standard",
  targetChapters: 3,
  targetWordsPerChapter: 1_000,
  waveSize: 1,
  requireOutlineApproval: true,
  inputSnapshot: {
    brief: "A complete short story brief that is long enough.",
    genre: "Fantasy",
    styleGuide: null,
    voiceProfile: null,
    pov: null,
    tense: null,
    tone: null,
    styleProfile: null,
    heatLevel: null,
    violenceLevel: null,
    profanity: null,
    avoidTopics: [],
  },
};

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    projectId,
    kind: "full_book",
    config,
    status: "queued",
    workflowRunId: null,
    acceptanceUncertainAt: new Date("2026-07-30T12:00:00.000Z"),
    acceptanceDispatchClaimedAt: null,
    ...overrides,
  };
}

function mockSelectRows(...results: unknown[][]) {
  const queue = [...results];
  const limit = vi.fn().mockImplementation(async () => queue.shift() ?? []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  mocks.getDb.mockReturnValue({ select });
  return { select, limit };
}

function request() {
  return POST(new Request(`https://sopher.ai/api/runs/${runId}/retry-start`, { method: "POST" }), {
    params: Promise.resolve({ runId }),
  });
}

describe("POST /api/runs/[runId]/retry-start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T12:10:00.000Z"));
    mocks.requireUser.mockResolvedValue({ userId: "user-1" });
    mocks.assertNotSuspended.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue({ limited: false });
    mocks.authorizeProjectSpend.mockResolvedValue(null);
    mocks.prepareFullBookRunDispatch.mockResolvedValue(config);
    mocks.markAuthoringRunDispatchReady.mockResolvedValue(config);
    mocks.claimUncertainAuthoringRun.mockResolvedValue({
      id: runId,
      projectId,
      userId: "user-1",
      kind: "full_book",
      config,
    });
    mocks.linkAuthoringRunWorkflow.mockResolvedValue(true);
    mocks.markAuthoringRunAcceptanceUncertain.mockResolvedValue(true);
    mocks.settleStubbedAuthoringRunHandoff.mockResolvedValue(true);
    mocks.isE2EWorkflowStubEnabled.mockReturnValue(false);
    mocks.start.mockResolvedValue({ runId: "workflow-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reattaches a durable Workflow before consuming retry rate limit", async () => {
    mockSelectRows([snapshot({ workflowRunId: "workflow-existing" })]);

    const response = await request();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      handoffConfirmed: true,
      confirmationPending: false,
      reattached: true,
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("does not redispatch while another fresh claim may still be invoking Workflow", async () => {
    mockSelectRows([
      snapshot({ acceptanceDispatchClaimedAt: new Date("2026-07-30T12:09:30.000Z") }),
    ]);

    const response = await request();

    expect(response.status).toBe(202);
    expect(response.headers.get("retry-after")).toBe("90");
    await expect(response.json()).resolves.toMatchObject({
      handoffConfirmed: false,
      confirmationPending: true,
      safeToRetry: false,
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.claimUncertainAuthoringRun).not.toHaveBeenCalled();
  });

  it("does not label a normal fresh initial dispatch as uncertain", async () => {
    mockSelectRows([
      snapshot({
        acceptanceUncertainAt: null,
        acceptanceDispatchClaimedAt: new Date("2026-07-30T12:09:30.000Z"),
      }),
    ]);

    const response = await request();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "This run does not have a retryable uncertain handoff",
      handoffConfirmed: false,
      confirmationPending: false,
    });
    expect(mocks.claimUncertainAuthoringRun).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("recovers the same run after an abandoned initial dispatch lease expires", async () => {
    mockSelectRows([
      snapshot({
        acceptanceUncertainAt: null,
        acceptanceDispatchClaimedAt: new Date("2026-07-30T12:07:59.000Z"),
      }),
    ]);

    const response = await request();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      runId,
      handoffConfirmed: true,
      confirmationPending: false,
    });
    expect(mocks.claimUncertainAuthoringRun).toHaveBeenCalledWith({
      runId,
      projectId,
      userId: "user-1",
    });
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it("purchase-gates a legacy full-book retry before preparation or Workflow dispatch", async () => {
    mockSelectRows([snapshot()]);
    mocks.authorizeProjectSpend.mockResolvedValue(
      Response.json(
        { error: "Purchase credits to continue", code: "purchase_required" },
        { status: 402 },
      ),
    );

    const response = await request();

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({ code: "purchase_required" });
    expect(mocks.authorizeProjectSpend).toHaveBeenCalledWith({
      userId: "user-1",
      projectId,
      operationKind: "whole_story_start",
    });
    expect(mocks.prepareFullBookRunDispatch).not.toHaveBeenCalled();
    expect(mocks.claimUncertainAuthoringRun).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("never redispatches a terminal database run", async () => {
    mockSelectRows([snapshot({ status: "failed" })]);

    const response = await request();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      status: "failed",
      handoffConfirmed: false,
    });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("claims and confirms one same-run Workflow redispatch", async () => {
    mockSelectRows([snapshot()]);

    const response = await request();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      runId,
      handoffConfirmed: true,
      confirmationPending: false,
    });
    expect(mocks.claimUncertainAuthoringRun).toHaveBeenCalledWith({
      runId,
      projectId,
      userId: "user-1",
    });
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.linkAuthoringRunWorkflow).toHaveBeenCalledWith({
      runId,
      projectId,
      userId: "user-1",
      workflowRunId: "workflow-1",
    });
  });

  it("rebuilds an unfinished full-book snapshot before claiming or dispatching it", async () => {
    const staleConfig = {
      ...config,
      dispatchReady: undefined,
      inputSnapshot: { ...config.inputSnapshot, workingTitle: "Stale title" },
    };
    const finalConfig = {
      ...config,
      inputSnapshot: { ...config.inputSnapshot, workingTitle: "Final persisted title" },
    };
    mockSelectRows([snapshot({ config: staleConfig })]);
    mocks.prepareFullBookRunDispatch.mockResolvedValue(finalConfig);
    mocks.claimUncertainAuthoringRun.mockResolvedValue({
      id: runId,
      projectId,
      userId: "user-1",
      kind: "full_book",
      config: finalConfig,
    });

    const response = await request();

    expect(response.status).toBe(202);
    expect(mocks.prepareFullBookRunDispatch).toHaveBeenCalledWith({
      runId,
      projectId,
      userId: "user-1",
    });
    expect(mocks.prepareFullBookRunDispatch.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.claimUncertainAuthoringRun.mock.invocationCallOrder[0],
    );
    expect(mocks.start).toHaveBeenCalledWith(expect.any(Function), [
      runId,
      projectId,
      "user-1",
      finalConfig,
    ]);
  });

  it("confirms an isolated same-run retry without creating a real Workflow", async () => {
    mockSelectRows([snapshot()]);
    mocks.isE2EWorkflowStubEnabled.mockReturnValue(true);

    const response = await request();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      runId,
      handoffConfirmed: true,
      confirmationPending: false,
      stubbed: true,
    });
    expect(mocks.settleStubbedAuthoringRunHandoff).toHaveBeenCalledWith({
      runId,
      projectId,
      userId: "user-1",
    });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("keeps an ambiguous start active and truthfully unconfirmed", async () => {
    mockSelectRows([snapshot()]);
    mocks.start.mockRejectedValue(new Error("response lost"));

    const response = await request();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      runId,
      handoffConfirmed: false,
      confirmationPending: true,
      safeToRetry: true,
    });
    expect(mocks.markAuthoringRunAcceptanceUncertain).toHaveBeenCalledWith({
      runId,
      projectId,
      userId: "user-1",
    });
    expect(mocks.terminalizeAuthoringRun).not.toHaveBeenCalled();
  });

  it("does not claim handoff success when the linkage CAS loses without a durable owner", async () => {
    mockSelectRows(
      [snapshot()],
      [
        {
          status: "queued",
          workflowRunId: null,
          acceptanceUncertainAt: new Date("2026-07-30T12:00:00.000Z"),
        },
      ],
    );
    mocks.linkAuthoringRunWorkflow.mockResolvedValue(false);

    const response = await request();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      handoffConfirmed: false,
      confirmationPending: true,
    });
  });
});

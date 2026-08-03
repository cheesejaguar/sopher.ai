import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
  getBalance: vi.fn(),
  resumeHook: vi.fn(),
  acceptAuthoringRunInput: vi.fn(),
  authoringInputPayloadsEqual: vi.fn(),
  authoringInputToken: vi.fn(),
  deliverAuthoringRunInput: vi.fn(),
}));

vi.mock("workflow/api", () => ({ resumeHook: mocks.resumeHook }));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/lib/billing/credits", () => ({ getBalance: mocks.getBalance }));

vi.mock("@/lib/authoring-inputs", () => ({
  acceptAuthoringRunInput: mocks.acceptAuthoringRunInput,
  authoringInputPayloadsEqual: mocks.authoringInputPayloadsEqual,
  authoringInputToken: mocks.authoringInputToken,
  deliverAuthoringRunInput: mocks.deliverAuthoringRunInput,
}));

import { POST } from "./route";

const RUN_ID = "11111111-1111-4111-8111-111111111111";

function runQuery(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit }),
    }),
  };
}

function eventQuery(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function mockLegacyRun(
  stage: "awaiting_approval" | "awaiting_credits",
  newerEvents: Array<{ payload: unknown }> = [{ payload: { malformed: "newer invalid event" } }],
  cancellationRequestedAt: Date | null = null,
) {
  const run = {
    id: RUN_ID,
    status: "awaiting_input",
    config: {},
    pauseKind: null,
    pauseVersion: 0,
    pauseRegisteredAt: null,
    pauseDetails: null,
    cancellationRequestedAt,
  };
  const select = vi
    .fn()
    .mockReturnValueOnce(runQuery([run]))
    .mockReturnValueOnce(
      eventQuery([...newerEvents, { payload: { type: "stage", stage, pct: 12 } }]),
    );
  mocks.getDb.mockReturnValue({ select });
}

function request(body: Record<string, unknown>) {
  return POST(
    new Request(`https://sopher.ai/api/runs/${RUN_ID}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ runId: RUN_ID }) },
  );
}

describe("POST /api/runs/[runId]/input pinned-v1 compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "author-1" });
    mocks.authoringInputPayloadsEqual.mockImplementation(
      (left, right) => JSON.stringify(left) === JSON.stringify(right),
    );
    mocks.getBalance.mockResolvedValue(20);
    mocks.resumeHook.mockResolvedValue(undefined);
  });

  it("signals a legacy outline hook only for the latest valid approval pause", async () => {
    mockLegacyRun("awaiting_approval");

    const response = await request({ kind: "outline-approval", approved: true });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ resumed: true, protocolVersion: 1 });
    expect(mocks.resumeHook).toHaveBeenCalledWith(`outline-approval:${RUN_ID}`, {
      approved: true,
      notes: undefined,
    });
    expect(mocks.getBalance).not.toHaveBeenCalled();
  });

  it("signals a legacy top-up hook only for the latest valid credit pause", async () => {
    mockLegacyRun("awaiting_credits");

    const response = await request({ kind: "credits-topup" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      resumed: true,
      balance: 20,
      protocolVersion: 1,
    });
    expect(mocks.resumeHook).toHaveBeenCalledWith(`credits-topup:${RUN_ID}`, {
      toppedUp: true,
    });
  });

  it.each([
    {
      stage: "awaiting_approval" as const,
      body: { kind: "credits-topup" },
    },
    {
      stage: "awaiting_credits" as const,
      body: { kind: "outline-approval", approved: true },
    },
  ])("rejects $body.kind while the pinned run is at $stage", async ({ stage, body }) => {
    mockLegacyRun(stage);

    const response = await request(body);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Run is not waiting for this input",
    });
    expect(mocks.resumeHook).not.toHaveBeenCalled();
    expect(mocks.getBalance).not.toHaveBeenCalled();
  });

  it("does not revive an older pause after a later production stage was persisted", async () => {
    mockLegacyRun("awaiting_approval", [
      { payload: { type: "stage", stage: "chapters", pct: 40 } },
    ]);

    const response = await request({ kind: "outline-approval", approved: true });

    expect(response.status).toBe(409);
    expect(mocks.resumeHook).not.toHaveBeenCalled();
  });

  it("rejects pinned-v1 input after a cancellation request", async () => {
    mockLegacyRun(
      "awaiting_approval",
      [{ payload: { type: "stage", stage: "awaiting_approval", pct: 12 } }],
      new Date("2026-07-30T12:00:00.000Z"),
    );

    const response = await request({ kind: "outline-approval", approved: true });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This run is stopping and cannot accept more input",
      code: "cancellation_requested",
    });
    expect(mocks.resumeHook).not.toHaveBeenCalled();
  });

  it("rejects protocol-v2 input after a cancellation request", async () => {
    const run = {
      id: RUN_ID,
      status: "awaiting_input",
      config: { protocolVersion: 2 },
      pauseKind: "outline_approval",
      pauseVersion: 1,
      pauseRegisteredAt: new Date("2026-07-30T11:59:00.000Z"),
      pauseDetails: { resumeStage: "bible" },
      cancellationRequestedAt: new Date("2026-07-30T12:00:00.000Z"),
    };
    mocks.getDb.mockReturnValue({ select: vi.fn().mockReturnValue(runQuery([run])) });

    const response = await request({ kind: "outline-approval", approved: true });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "cancellation_requested" });
    expect(mocks.acceptAuthoringRunInput).not.toHaveBeenCalled();
    expect(mocks.deliverAuthoringRunInput).not.toHaveBeenCalled();
  });
});

describe("POST /api/runs/[runId]/input protocol-v3 creative decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "author-1" });
    mocks.authoringInputPayloadsEqual.mockImplementation(
      (left, right) => JSON.stringify(left) === JSON.stringify(right),
    );
    mocks.authoringInputToken.mockReturnValue(`authoring-input:${RUN_ID}:creative_decision:3`);
    mocks.deliverAuthoringRunInput.mockResolvedValue("delivered");
  });

  it("persists the exact registered question response before signaling its hook", async () => {
    const questionId = "22222222-2222-4222-8222-222222222222";
    const decisionDigest = "a".repeat(64);
    const payload = {
      questionId,
      decisionDigest,
      mode: "option",
      selectedOptionId: "option-2",
    };
    const run = {
      id: RUN_ID,
      status: "awaiting_input",
      config: { protocolVersion: 3 },
      pauseKind: "creative_decision",
      pauseVersion: 3,
      pauseRegisteredAt: new Date("2026-08-02T12:00:00.000Z"),
      pauseDetails: { questionId, resumeStage: "outline" },
      cancellationRequestedAt: null,
    };
    const question = {
      id: questionId,
      decisionDigest,
      options: [
        { id: "option-1", label: "One", description: "First direction" },
        { id: "option-2", label: "Two", description: "Second direction" },
        { id: "option-3", label: "Three", description: "Third direction" },
      ],
      pauseVersion: 3,
      status: "pending",
    };
    const select = vi
      .fn()
      .mockReturnValueOnce(runQuery([run]))
      .mockReturnValueOnce(runQuery([]))
      .mockReturnValueOnce(runQuery([question]));
    mocks.getDb.mockReturnValue({ select });
    mocks.acceptAuthoringRunInput.mockResolvedValue({
      input: {
        id: "33333333-3333-4333-8333-333333333333",
        kind: "creative_decision",
        pauseVersion: 3,
        payload,
        status: "accepted",
      },
      replayed: false,
    });

    const response = await request({
      kind: "creative-decision",
      ...payload,
      requestKey: "44444444-4444-4444-8444-444444444444",
    });

    expect(response.status).toBe(200);
    expect(mocks.acceptAuthoringRunInput).toHaveBeenCalledWith({
      runId: RUN_ID,
      userId: "author-1",
      kind: "creative_decision",
      pauseVersion: 3,
      payload,
      requestKey: "44444444-4444-4444-8444-444444444444",
    });
    expect(mocks.deliverAuthoringRunInput).toHaveBeenCalledWith({
      inputId: "33333333-3333-4333-8333-333333333333",
      token: `authoring-input:${RUN_ID}:creative_decision:3`,
    });
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      resumed: true,
      protocolVersion: 3,
    });
  });

  it("replays a consumed decision after Workflow advances before the response arrives", async () => {
    const questionId = "22222222-2222-4222-8222-222222222222";
    const decisionDigest = "a".repeat(64);
    const requestKey = "44444444-4444-4444-8444-444444444444";
    const payload = { questionId, decisionDigest, mode: "sopher" };
    const run = {
      id: RUN_ID,
      status: "running",
      config: { protocolVersion: 3 },
      pauseKind: null,
      pauseVersion: 3,
      pauseRegisteredAt: null,
      pauseDetails: null,
      cancellationRequestedAt: null,
    };
    const existingInput = {
      kind: "creative_decision",
      payload,
      status: "consumed",
    };
    const select = vi
      .fn()
      .mockReturnValueOnce(runQuery([run]))
      .mockReturnValueOnce(runQuery([existingInput]));
    mocks.getDb.mockReturnValue({ select });

    const response = await request({
      kind: "creative-decision",
      ...payload,
      requestKey,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      resumed: true,
      replayed: true,
      delivery: "already_consumed",
      protocolVersion: 3,
    });
    expect(mocks.acceptAuthoringRunInput).not.toHaveBeenCalled();
    expect(mocks.deliverAuthoringRunInput).not.toHaveBeenCalled();
  });

  it("rejects a stale question digest before accepting an input", async () => {
    const questionId = "22222222-2222-4222-8222-222222222222";
    const run = {
      id: RUN_ID,
      status: "awaiting_input",
      config: { protocolVersion: 3 },
      pauseKind: "creative_decision",
      pauseVersion: 3,
      pauseRegisteredAt: new Date("2026-08-02T12:00:00.000Z"),
      pauseDetails: { questionId, resumeStage: "outline" },
      cancellationRequestedAt: null,
    };
    const question = {
      id: questionId,
      decisionDigest: "a".repeat(64),
      options: [
        { id: "option-1", label: "One", description: "First direction" },
        { id: "option-2", label: "Two", description: "Second direction" },
        { id: "option-3", label: "Three", description: "Third direction" },
      ],
      pauseVersion: 3,
      status: "pending",
    };
    const select = vi
      .fn()
      .mockReturnValueOnce(runQuery([run]))
      .mockReturnValueOnce(runQuery([question]));
    mocks.getDb.mockReturnValue({ select });

    const response = await request({
      kind: "creative-decision",
      questionId,
      decisionDigest: "b".repeat(64),
      mode: "sopher",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "stale_creative_question",
      error: expect.stringMatching(/question changed/i),
    });
    expect(mocks.acceptAuthoringRunInput).not.toHaveBeenCalled();
    expect(mocks.deliverAuthoringRunInput).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
  getBalance: vi.fn(),
  resumeHook: vi.fn(),
  acceptAuthoringRunInput: vi.fn(),
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

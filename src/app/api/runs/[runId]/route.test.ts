import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
  getRunHealth: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/lib/run-health", () => ({
  getRunHealth: mocks.getRunHealth,
}));

import { GET } from "./route";

const runId = "11111111-1111-4111-8111-111111111111";
const createdAt = new Date("2026-07-30T12:00:00.000Z");

function mockRunQuery(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  mocks.getDb.mockReturnValue({ select });
  return { select, from, where, limit };
}

describe("GET /api/runs/[runId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  });

  it("returns a compact no-store health snapshot without durable checkpoint prose", async () => {
    const run = {
      id: runId,
      projectId: "project-1",
      userId: "user-1",
      workflowRunId: "workflow-1",
      kind: "full_book",
      status: "running",
      config: {
        targetChapters: 3,
        checkpointedChapterProse: "content that must stay server-side",
      },
      error: null,
      startedAt: createdAt,
      completedAt: null,
      createdAt,
    };
    const query = mockRunQuery([run]);
    mocks.getRunHealth.mockResolvedValue({
      databaseStatus: "running",
      workflowStatus: "running",
      effectiveStatus: "running",
      spend: { meteredUsd: 0.42, creditsUsed: 1.2 },
    });

    const response = await GET(new Request(`https://sopher.ai/api/runs/${runId}`), {
      params: Promise.resolve({ runId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toMatchObject({
      run: {
        id: runId,
        status: "running",
        workflowRunId: "workflow-1",
      },
      totalUsd: 0.42,
      totalCredits: 1.2,
    });
    expect(body.run).not.toHaveProperty("config");
    expect(body.run).not.toHaveProperty("projectId");
    expect(body).not.toHaveProperty("events");
    expect(mocks.getRunHealth).toHaveBeenCalledWith(run);
    expect(query.select).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed run ids before querying the database", async () => {
    mockRunQuery([]);

    const response = await GET(new Request("https://sopher.ai/api/runs/not-a-uuid"), {
      params: Promise.resolve({ runId: "not-a-uuid" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.getRunHealth).not.toHaveBeenCalled();
  });
});

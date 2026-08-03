import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireUser: mocks.requireUser };
});

import { GET, POST } from "./route";

const requestKey = "11111111-1111-4111-8111-111111111111";

describe("isolated E2E start-state inspection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("E2E_DATABASE_HOST", "isolated.example.test");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@isolated.example.test/test");
    vi.stubEnv("VERCEL_ENV", "");
    mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is unreachable in production even when both explicit E2E flags are set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_DATABASE_ISOLATED", "1");
    vi.stubEnv("E2E_STUB_WORKFLOW", "1");

    const response = await GET(
      new Request(`https://sopher.ai/api/internal/e2e/start-state?requestKey=${requestKey}`),
    );

    expect(response.status).toBe(404);

    const mutationResponse = await POST(
      new Request("https://sopher.ai/api/internal/e2e/start-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "make_uncertain_handoff", requestKey }),
      }),
    );
    expect(mutationResponse.status).toBe(404);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns only the signed-in user's project and intentional run attempts", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_DATABASE_ISOLATED", "1");
    vi.stubEnv("E2E_STUB_WORKFLOW", "1");

    const projectRows = [{ id: "project-1", experience: "trial_short_story" }];
    const runRows = [
      {
        id: "run-1",
        projectId: "project-1",
        requestKey,
        status: "failed",
        workflowRunId: null,
      },
      {
        id: "run-2",
        projectId: "project-1",
        requestKey: "22222222-2222-4222-8222-222222222222",
        status: "queued",
        workflowRunId: null,
      },
    ];
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(projectRows),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn().mockResolvedValue(runRows),
          })),
        })),
      });
    mocks.getDb.mockReturnValue({ select });

    const response = await GET(
      new Request(`https://sopher.ai/api/internal/e2e/start-state?requestKey=${requestKey}`),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      projectCount: 1,
      runCount: 2,
      activeRunCount: 1,
      distinctRequestKeyCount: 2,
      projects: projectRows,
      runs: runRows,
    });
  });

  it("marks only the signed-in user's queued stub run as an uncertain handoff", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_DATABASE_ISOLATED", "1");
    vi.stubEnv("E2E_STUB_WORKFLOW", "1");

    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: "project-1" }]),
          })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: "run-1" }]),
          })),
        })),
      });
    const returning = vi.fn().mockResolvedValue([{ id: "run-1" }]);
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning })),
      })),
    }));
    mocks.getDb.mockReturnValue({ select, update });

    const response = await POST(
      new Request("https://sopher.ai/api/internal/e2e/start-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "make_uncertain_handoff", requestKey }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runId: "run-1",
      state: "uncertain_handoff",
    });
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledOnce();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getChapterOwnership: vi.fn(),
  getDb: vi.fn(),
  rateLimit: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb, withDbTransaction: vi.fn() };
});
vi.mock("@/db/queries/books", () => ({ getChapterOwnership: mocks.getChapterOwnership }));
vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/lib/security/rate-limit", () => ({
  LIMITS: { diagramCache: "diagram-cache" },
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/blob/lifecycle", () => ({ resolveBlobUploads: vi.fn() }));
vi.mock("@/lib/blob/orphan-cleanup", () => ({
  compensateUnreferencedBlobUpload: vi.fn(),
  scheduleUnreferencedBlobCleanup: vi.fn(),
}));

import { POST } from "./route";

const chapterId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";

/** Minimal valid PNG header: signature + IHDR length/type + 1×1 dimensions. */
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

function mockQueries(existing: unknown[], usage: unknown[]) {
  const results = [existing, usage];
  const select = vi.fn(() => {
    const rows = results.shift() ?? [];
    const whereResult = {
      limit: vi.fn().mockResolvedValue(rows),
      then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return { from: vi.fn(() => ({ where: vi.fn(() => whereResult) })) };
  });
  mocks.getDb.mockReturnValue({ select });
}

function post(pngBase64: string) {
  return POST(
    new Request("https://sopher.ai/api/assets/diagram", {
      method: "POST",
      body: JSON.stringify({
        chapterId,
        source: "graph TD; A-->B",
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
        pngBase64,
      }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  mocks.getChapterOwnership.mockResolvedValue({ userId: "user-1", projectId });
  mocks.rateLimit.mockResolvedValue({ limited: false });
});

describe("POST /api/assets/diagram", () => {
  it("refuses bytes that are not a PNG before uploading anything", async () => {
    mockQueries([], [{ count: 0, bytes: 0 }]);
    const response = await post(Buffer.from("<html>not a png</html>").toString("base64"));
    expect(response.status).toBe(400);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("refuses a project that has reached its diagram ceiling", async () => {
    mockQueries([], [{ count: 1_000, bytes: 0 }]);
    const response = await post(PNG_HEADER.toString("base64"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "diagram_limit" });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("rate-limits cache misses per user", async () => {
    mockQueries([], [{ count: 0, bytes: 0 }]);
    mocks.rateLimit.mockResolvedValue({
      limited: true,
      response: Response.json({ error: "Too many requests" }, { status: 429 }),
    });
    const response = await post(PNG_HEADER.toString("base64"));
    expect(response.status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith("diagram-cache", expect.any(Request), "user-1");
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("answers an already-cached diagram without spending the limit", async () => {
    mockQueries([{ contentType: "image/svg+xml" }, { contentType: "image/png" }], []);
    const response = await post(PNG_HEADER.toString("base64"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ cached: true });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
});

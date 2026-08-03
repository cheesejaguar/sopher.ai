import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createReaderShare: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/lib/security/rate-limit", () => ({
  LIMITS: { readerShare: "reader-share" },
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/publication-editions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/publication-editions")>();
  return {
    ...original,
    createReaderShare: mocks.createReaderShare,
    listReaderShares: vi.fn(),
    revokeReaderShare: vi.fn(),
  };
});

import { POST } from "./route";

const projectId = "11111111-1111-4111-8111-111111111111";
const requestKey = "22222222-2222-4222-8222-222222222222";
const token = "uXFb2jtK_sno-TzLiofyD7TqBYZ3p3YP5eI6jgoyjZs";

beforeEach(() => {
  mocks.requireUser.mockReset().mockResolvedValue({ userId: "user-1" });
  mocks.createReaderShare.mockReset();
  mocks.rateLimit.mockReset().mockResolvedValue({ limited: false });
});

describe("reader-share creation route", () => {
  it("never accepts a caller-selected bearer secret", async () => {
    const response = await POST(
      new Request("https://sopher.ai/api/projects/x/reader-shares", {
        method: "POST",
        body: JSON.stringify({ token, expires: "30d", acceptedReaderTerms: true }),
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.createReaderShare).not.toHaveBeenCalled();
  });

  it("requires explicit sharing consent and returns a fragment-only secret URL", async () => {
    const withoutConsent = await POST(
      new Request("https://sopher.ai/api/projects/x/reader-shares", {
        method: "POST",
        body: JSON.stringify({ requestKey, expires: "30d" }),
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(withoutConsent.status).toBe(400);

    mocks.createReaderShare.mockResolvedValue({
      outcome: "created",
      token,
      share: { id: "33333333-3333-4333-8333-333333333333" },
    });
    const response = await POST(
      new Request("https://sopher.ai/api/projects/x/reader-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey,
          expires: "30d",
          allowDownload: false,
          acceptedReaderTerms: true,
        }),
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { url: string };
    expect(body.url).toBe(`/r/33333333-3333-4333-8333-333333333333#token=${token}`);
    expect(body.url).not.toMatch(/\/r\/[A-Za-z0-9_-]{43}/);
    expect(mocks.createReaderShare).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", projectId, requestKey }),
    );
  });
});

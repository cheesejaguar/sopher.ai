import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
  assertNotSuspended: vi.fn(),
  ownership: vi.fn(),
  getChapterById: vi.fn(),
  rateLimit: vi.fn(),
  authorizeProjectSpend: vi.fn(),
  proofreadChapter: vi.fn(),
  refundMeteredDelivery: vi.fn(),
  findDelivery: vi.fn(),
  persistDelivery: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireUser: mocks.requireUser,
    assertNotSuspended: mocks.assertNotSuspended,
  };
});
vi.mock("@/db/queries/books", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/queries/books")>();
  return {
    ...actual,
    getChapterOwnership: mocks.ownership,
    getChapterById: mocks.getChapterById,
  };
});
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...actual, rateLimit: mocks.rateLimit };
});
vi.mock("@/lib/project-spend-http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/project-spend-http")>();
  return { ...actual, authorizeProjectSpend: mocks.authorizeProjectSpend };
});
// resolveProofreadAnchors stays real: it is the stage that decides whether a
// correction is usable, and these tests are about what the route does with its
// verdict.
vi.mock("@/ai/agents/proofread", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ai/agents/proofread")>();
  return { ...actual, proofreadChapter: mocks.proofreadChapter };
});
vi.mock("@/ai/metering", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ai/metering")>();
  return { ...actual, refundMeteredDelivery: mocks.refundMeteredDelivery };
});
vi.mock("@/lib/chapter-proofread-delivery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chapter-proofread-delivery")>();
  return {
    ...actual,
    findChapterProofreadDelivery: mocks.findDelivery,
    persistChapterProofreadDelivery: mocks.persistDelivery,
  };
});

import { POST } from "./route";

const chapterId = "11111111-1111-4111-8111-111111111111";
const operationKey = "22222222-2222-4222-8222-222222222222";
const CONTENT = "The gate stood open all night. Nobody came through it before dawn.";

function request() {
  return new Request(`http://localhost/api/chapters/${chapterId}/proofread`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": operationKey },
    body: "{}",
  });
}

function post() {
  return POST(request(), { params: Promise.resolve({ chapterId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  mocks.assertNotSuspended.mockResolvedValue(undefined);
  mocks.ownership.mockResolvedValue({
    userId: "user-1",
    projectId: "project-1",
    bookId: "book-1",
    chapterId,
    chapterNumber: 1,
  });
  mocks.findDelivery.mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue({ limited: false });
  mocks.getChapterById.mockResolvedValue({ id: chapterId, content: CONTENT, version: 3 });
  mocks.authorizeProjectSpend.mockResolvedValue(null);
  mocks.refundMeteredDelivery.mockResolvedValue(true);
  mocks.persistDelivery.mockResolvedValue({ suggestions: [], skipped: 0, replayed: false });
  const chain = { from: vi.fn(), where: vi.fn(), limit: vi.fn().mockResolvedValue([]) };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  mocks.getDb.mockReturnValue({ select: vi.fn().mockReturnValue(chain) });
});

describe("chapter proofread refunds an empty delivery", () => {
  it("refunds when normalization leaves no corrections at all", async () => {
    // What a fully-salvaged-away response looks like from here: the agent
    // normalizes before returning, so an all-dropped answer and a clean
    // chapter arrive identically.
    mocks.proofreadChapter.mockResolvedValue({ corrections: [] });

    const response = await post();

    expect(mocks.refundMeteredDelivery).toHaveBeenCalledWith(
      expect.anything(),
      "Chapter proofread produced no corrections — refunded",
    );
    // Still a durable delivery: the same idempotency key must replay it.
    expect(mocks.persistDelivery).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: [], skipped: 0 });
  });

  it("refunds under a distinct description when corrections cannot be anchored", async () => {
    mocks.proofreadChapter.mockResolvedValue({
      corrections: [
        {
          anchorText: "A sentence that is not in this chapter at all.",
          replacement: "A sentence that is not in this chapter at all!",
          rationale: "Wrong terminal punctuation",
          category: "punctuation",
          severity: "warning",
        },
      ],
    });

    const response = await post();

    expect(mocks.refundMeteredDelivery).toHaveBeenCalledWith(
      expect.anything(),
      "Chapter proofread returned unusable corrections — refunded",
    );
    expect(mocks.persistDelivery).not.toHaveBeenCalled();
    expect(response.status).toBe(502);
  });

  it("does not refund a pass that delivered a correction", async () => {
    mocks.proofreadChapter.mockResolvedValue({
      corrections: [
        {
          anchorText: "Nobody came through it before dawn.",
          replacement: "Nobody came through it before dawn!",
          rationale: "Wrong terminal punctuation",
          category: "punctuation",
          severity: "warning",
        },
      ],
    });

    const response = await post();

    expect(mocks.refundMeteredDelivery).not.toHaveBeenCalled();
    expect(mocks.persistDelivery).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });
});

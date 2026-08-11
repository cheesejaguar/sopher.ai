import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
  assertNotSuspended: vi.fn(),
  ownership: vi.fn(),
  chapter: vi.fn(),
  rateLimit: vi.fn(),
  authorizeProjectSpend: vi.fn(),
  assertCreditsForUsd: vi.fn(),
  generateText: vi.fn(),
  metered: vi.fn(),
  refundMeteredDelivery: vi.fn(),
  completeMeteredDelivery: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: vi.fn() },
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
    getChapterById: mocks.chapter,
  };
});
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return { ...actual, rateLimit: mocks.rateLimit };
});
vi.mock("@/ai/metering", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ai/metering")>();
  return {
    ...actual,
    gatewayOptions: vi.fn(() => ({})),
    metered: mocks.metered,
    refundMeteredDelivery: mocks.refundMeteredDelivery,
    completeMeteredDelivery: mocks.completeMeteredDelivery,
  };
});
vi.mock("@/lib/billing/credits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/credits")>();
  return { ...actual, assertCreditsForUsd: mocks.assertCreditsForUsd };
});
vi.mock("@/lib/project-spend-http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/project-spend-http")>();
  return { ...actual, authorizeProjectSpend: mocks.authorizeProjectSpend };
});

import { POST } from "./route";

const chapterId = "11111111-1111-4111-8111-111111111111";
const operationKey = "22222222-2222-4222-8222-222222222222";
const suggestion = {
  id: "33333333-3333-4333-8333-333333333333",
  chapterId,
  runId: null,
  chapterVersion: 4,
  passType: "selection" as const,
  suggestionType: "selection",
  severity: "info" as const,
  anchor: {
    start: 4,
    end: 9,
    originalText: "brown",
    occurrence: 0,
    operationKey,
  },
  suggestedText: "silver",
  explanation: "More vivid",
  instruction: "Make it vivid",
  status: "pending" as const,
  createdAt: new Date(),
};

function query<T>(rows: T[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
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
  mocks.chapter.mockResolvedValue({
    id: chapterId,
    content: "The brown fox.",
    version: 4,
  });
  mocks.rateLimit.mockResolvedValue({ limited: false });
  mocks.authorizeProjectSpend.mockResolvedValue(null);
  mocks.assertCreditsForUsd.mockResolvedValue(undefined);
  mocks.refundMeteredDelivery.mockResolvedValue(true);
  mocks.completeMeteredDelivery.mockResolvedValue(undefined);
  mocks.getDb.mockReturnValue({
    select: vi.fn().mockReturnValue(query([suggestion])),
  });
});

describe("paid selection-edit delivery", () => {
  it("replays the saved suggestion before rate limiting or another model call", async () => {
    const response = await POST(
      new Request(`http://localhost/api/chapters/${chapterId}/edits`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": operationKey,
        },
        body: JSON.stringify({
          selection: { start: 4, end: 9, text: "brown" },
          instruction: "Make it vivid",
        }),
      }),
      { params: Promise.resolve({ chapterId }) },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ suggestion: { id: suggestion.id } });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.metered).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("refunds an unchanged provider result and does not persist a suggestion", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ settings: { qualityTier: "standard" } }]));
    const insert = vi.fn();
    mocks.getDb.mockReturnValue({ select, insert });
    mocks.metered.mockImplementation(
      async (_meter: unknown, _info: unknown, run: () => Promise<unknown>) => await run(),
    );
    mocks.generateText.mockImplementation(async (options: { prompt: string }) => {
      expect(options.prompt).toContain('"replacement" must make a concrete textual change');
      expect(options.prompt).toContain("Never repeat the selection unchanged");
      return { output: { replacement: "brown", rationale: "No change needed" } };
    });

    const response = await POST(
      new Request(`http://localhost/api/chapters/${chapterId}/edits`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": operationKey,
        },
        body: JSON.stringify({
          selection: { start: 4, end: 9, text: "brown" },
          instruction: "Make it vivid",
        }),
      }),
      { params: Promise.resolve({ chapterId }) },
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "The rewrite did not change the selected passage. Try a more specific instruction.",
      code: "no_change",
    });
    expect(mocks.refundMeteredDelivery).toHaveBeenCalledWith(
      expect.anything(),
      "Selection edit produced no change — refunded",
    );
    expect(insert).not.toHaveBeenCalled();
    expect(mocks.completeMeteredDelivery).not.toHaveBeenCalled();
  });
});

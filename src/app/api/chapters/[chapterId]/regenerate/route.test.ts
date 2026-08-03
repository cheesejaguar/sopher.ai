import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getChapterOwnership: vi.fn(),
  requireUser: vi.fn(),
  assertNotSuspended: vi.fn(),
  reconcile: vi.fn(),
  getSafetyBlock: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});

vi.mock("@/db/queries/books", () => ({
  getChapterById: vi.fn(),
  getChapterOwnership: mocks.getChapterOwnership,
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  assertNotSuspended: mocks.assertNotSuspended,
  UnauthorizedError: class UnauthorizedError extends Error {},
  SuspendedError: class SuspendedError extends Error {},
}));

vi.mock("workflow/api", () => ({ start: vi.fn() }));
vi.mock("@/workflows/generate-chapter", () => ({ generateChapter: vi.fn() }));
vi.mock("@/lib/generation-runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation-runs")>();
  return { ...actual, reconcileBeforeAuthoringRunConflict: mocks.reconcile };
});
vi.mock("@/lib/authoring-start-safety", () => ({
  getAuthoringStartSafetyBlock: mocks.getSafetyBlock,
}));

import { POST } from "./route";

const chapterId = "11111111-1111-4111-8111-111111111111";
const otherChapterId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const requestKey = "44444444-4444-4444-8444-444444444444";

function requestedRun(config: unknown) {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    kind: "chapter",
    status: "queued",
    config,
  };
}

function mockRequestedRuns(rows: ReturnType<typeof requestedRun>[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mocks.getDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from }) });
}

function mockRequestedRun(row: ReturnType<typeof requestedRun>) {
  mockRequestedRuns([row]);
}

function request() {
  return POST(
    new Request(`https://sopher.ai/api/chapters/${chapterId}/regenerate`, {
      method: "POST",
      headers: { "Idempotency-Key": requestKey },
    }),
    { params: Promise.resolve({ chapterId }) },
  );
}

describe("POST /api/chapters/[chapterId]/regenerate request-key reattachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "user-1" });
    mocks.assertNotSuspended.mockResolvedValue(undefined);
    mocks.getChapterOwnership.mockResolvedValue({
      chapterId,
      chapterNumber: 2,
      bookId: "66666666-6666-4666-8666-666666666666",
      projectId,
      userId: "user-1",
    });
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getSafetyBlock.mockResolvedValue(null);
  });

  it("reattaches only when the durable target chapter id and number both match", async () => {
    mockRequestedRun(
      requestedRun({
        chapterRegeneration: true,
        chapterRegenerationTarget: { chapterId, chapterNumber: 2 },
      }),
    );

    const response = await request();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      runId: "55555555-5555-4555-8555-555555555555",
      reattached: true,
    });
  });

  it.each([
    ["another chapter id", { chapterId: otherChapterId, chapterNumber: 2 }],
    ["another chapter number", { chapterId, chapterNumber: 3 }],
    ["a legacy target-less config", undefined],
  ])("rejects a request key already bound to %s", async (_label, target) => {
    mockRequestedRun(
      requestedRun({
        chapterRegeneration: true,
        ...(target ? { chapterRegenerationTarget: target } : {}),
      }),
    );

    const response = await request();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This request key already belongs to a different chapter regeneration",
    });
  });

  it("blocks replacement paid work before spend authorization when evidence needs support", async () => {
    mockRequestedRuns([]);
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

    const response = await request();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "support_required",
      supportReference: "SPH-PROJECT-RUN",
      action: { kind: "contact_support" },
    });
    expect(mocks.reconcile).toHaveBeenCalledWith({ projectId, userId: "user-1" });
    expect(mocks.getSafetyBlock).toHaveBeenCalledWith({ projectId, userId: "user-1" });
  });
});

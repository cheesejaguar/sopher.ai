import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  withDbTransaction: vi.fn(),
  getEntityForPortrait: vi.fn(),
  requireUser: vi.fn(),
  assertNotSuspended: vi.fn(),
  rateLimit: vi.fn(),
  authorizeProjectSpend: vi.fn(),
  projectSpendAccessErrorResponse: vi.fn(),
  assertCreditsForUsd: vi.fn(),
  metered: vi.fn(),
  put: vi.fn(),
  scheduleUnreferencedBlobCleanup: vi.fn(),
  compensateUnreferencedBlobUpload: vi.fn(),
  completeMeteredDelivery: vi.fn(),
  refundMeteredDelivery: vi.fn(),
  scheduleReplacedAssetCleanup: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: mocks.put }));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return {
    ...actual,
    getDb: mocks.getDb,
    withDbTransaction: mocks.withDbTransaction,
  };
});

vi.mock("@/db/queries/entities", () => ({
  getEntityForPortrait: mocks.getEntityForPortrait,
}));

vi.mock("@/db/transaction-operations", () => ({
  PORTRAIT_DELIVERY_TOOL_ID: "portrait",
  persistPortraitDeliveryTransaction: vi.fn(),
  promoteContentToolDeliveryReceiptTransaction: vi.fn(),
  promoteLegacyImageDeliveryTransaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  assertNotSuspended: mocks.assertNotSuspended,
  UnauthorizedError: class UnauthorizedError extends Error {},
  SuspendedError: class SuspendedError extends Error {},
}));

vi.mock("@/lib/security/rate-limit", () => ({
  LIMITS: { imageGen: {} },
  rateLimit: mocks.rateLimit,
}));

vi.mock("@/lib/project-spend-http", () => ({
  authorizeProjectSpend: mocks.authorizeProjectSpend,
  projectSpendAccessErrorResponse: mocks.projectSpendAccessErrorResponse,
}));

vi.mock("@/lib/billing/credits", () => ({
  assertCreditsForUsd: mocks.assertCreditsForUsd,
  InsufficientCreditsError: class InsufficientCreditsError extends Error {},
}));

vi.mock("@/ai/metering", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ai/metering")>();
  return {
    ...actual,
    gatewayOptions: vi.fn(() => ({})),
    meteredCallAuthorizationUsd: vi.fn(() => 0.5),
    metered: mocks.metered,
    completeMeteredDelivery: mocks.completeMeteredDelivery,
    refundMeteredDelivery: mocks.refundMeteredDelivery,
    healReplayedMeteredDelivery: vi.fn(),
  };
});

vi.mock("@/ai/metering-limits", () => ({
  meteredInputGuard: vi.fn(() => undefined),
  meteredMaxOutputTokens: vi.fn(() => 1_024),
}));

vi.mock("@/ai/models", () => ({
  MODELS: { standard: { image: "test-image-model" } },
}));

vi.mock("@/lib/blob/orphan-cleanup", () => ({
  scheduleUnreferencedBlobCleanup: mocks.scheduleUnreferencedBlobCleanup,
  compensateUnreferencedBlobUpload: mocks.compensateUnreferencedBlobUpload,
}));

vi.mock("@/lib/blob-cleanup", () => ({
  scheduleReplacedAssetCleanup: mocks.scheduleReplacedAssetCleanup,
}));

import { POST } from "./route";

const entityId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";

function mockSelectRows(...results: unknown[][]) {
  const queue = [...results];
  const limit = vi.fn().mockImplementation(async () => queue.shift() ?? []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  mocks.getDb.mockReturnValue({ select });
}

function request() {
  return POST(
    new Request(`https://sopher.ai/api/entities/${entityId}/portrait`, {
      method: "POST",
      headers: { "Idempotency-Key": "33333333-3333-4333-8333-333333333333" },
    }),
    { params: Promise.resolve({ entityId }) },
  );
}

describe("POST /api/entities/[entityId]/portrait", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "user-1" });
    mocks.assertNotSuspended.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue({ limited: false });
    mocks.getEntityForPortrait.mockResolvedValue({
      userId: "user-1",
      projectId,
      kind: "character",
      name: "Mara Vale",
      attrs: { physicalAppearance: "Dark curls and a silver scar" },
      genre: "Fantasy",
    });
    mockSelectRows([{ settings: { qualityTier: "standard" } }], []);
    mocks.authorizeProjectSpend.mockResolvedValue(null);
    mocks.projectSpendAccessErrorResponse.mockReturnValue(null);
    mocks.assertCreditsForUsd.mockResolvedValue(undefined);
    mocks.metered.mockResolvedValue({
      files: [{ mediaType: "image/png", uint8Array: new Uint8Array([1, 2, 3]) }],
    });
    mocks.put.mockResolvedValue({
      url: "https://blob.test/portrait.png",
      pathname: "portraits/project/entity.png",
    });
    mocks.scheduleUnreferencedBlobCleanup.mockResolvedValue(undefined);
  });

  it("preserves the active-production lock before credits, models, or Blob writes", async () => {
    mocks.withDbTransaction.mockResolvedValueOnce(null);
    mocks.authorizeProjectSpend.mockResolvedValueOnce(
      Response.json(
        {
          error: "Finish the current authoring run before using optional AI tools",
          code: "trial_busy",
        },
        { status: 409 },
      ),
    );

    const response = await request();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Finish the current authoring run before using optional AI tools",
      code: "trial_busy",
    });
    expect(mocks.assertCreditsForUsd).not.toHaveBeenCalled();
    expect(mocks.metered).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("preserves both the persistence and immutable-verification failures after upload", async () => {
    const persistenceError = new Error("portrait persistence failed");
    const verificationError = new Error("immutable receipt verification failed");
    mocks.withDbTransaction
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(persistenceError)
      .mockRejectedValueOnce(verificationError);

    let thrown: unknown;
    try {
      await request();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect(thrown).toMatchObject({
      message: "Portrait persistence failed and could not be verified",
      errors: [persistenceError, verificationError],
    });
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.withDbTransaction).toHaveBeenCalledTimes(3);
    expect(mocks.refundMeteredDelivery).not.toHaveBeenCalled();
    expect(mocks.completeMeteredDelivery).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
}));

vi.mock("@/db/queries/authoring-journey", () => ({
  getAuthoringJourneySnapshot: mocks.getSnapshot,
}));

import { getAuthoringStartSafetyBlock } from "./authoring-start-safety";

describe("getAuthoringStartSafetyBlock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only content-free support routing evidence", async () => {
    mocks.getSnapshot.mockResolvedValue({
      supportReference: "SPH-PROJECT1-RUN00001",
      nextAction: {
        kind: "contact_support",
        href: "mailto:support@sopher.ai?subject=help",
        label: "Contact support",
        description: "Durable evidence needs a safety recheck.",
        requiresMeteredAccess: false,
      },
    });

    await expect(
      getAuthoringStartSafetyBlock({ projectId: "project-1", userId: "author-1" }),
    ).resolves.toEqual({
      code: "support_required",
      supportReference: "SPH-PROJECT1-RUN00001",
      action: {
        kind: "contact_support",
        href: "mailto:support@sopher.ai?subject=help",
        label: "Contact support",
        description: "Durable evidence needs a safety recheck.",
        requiresMeteredAccess: false,
      },
    });
  });

  it("allows a new run when the authoritative action does not require support", async () => {
    mocks.getSnapshot.mockResolvedValue({
      supportReference: "SPH-PROJECT1-PROJECT",
      nextAction: { kind: "start_production" },
    });

    await expect(
      getAuthoringStartSafetyBlock({ projectId: "project-1", userId: "author-1" }),
    ).resolves.toBeNull();
  });
});

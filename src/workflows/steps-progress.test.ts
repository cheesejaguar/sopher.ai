import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStepMetadata: vi.fn(),
  persistRunEvent: vi.fn(),
  recordAuthoringIncident: vi.fn(),
  resolveAuthoringIncident: vi.fn(),
  streamWrite: vi.fn(),
  releaseLock: vi.fn(),
}));

vi.mock("workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("workflow")>();
  return {
    ...actual,
    getStepMetadata: mocks.getStepMetadata,
    getWritable: () => ({
      getWriter: () => ({
        write: mocks.streamWrite,
        releaseLock: mocks.releaseLock,
      }),
    }),
  };
});

vi.mock("@/lib/run-event-store", () => ({
  nextRunEventSequence: vi.fn(),
  persistRunEvent: mocks.persistRunEvent,
}));

vi.mock("@/lib/authoring-incidents", () => ({
  recordAuthoringIncident: mocks.recordAuthoringIncident,
  resolveAuthoringIncident: mocks.resolveAuthoringIncident,
}));

import { emitProgress } from "./steps";

const ref = {
  dbRunId: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  userId: "user-1",
};

const event = {
  type: "stage" as const,
  stage: "outline" as const,
  pct: 24,
  detail: "Building the outline",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getStepMetadata.mockReturnValue({ stepId: "stable-workflow-step" });
  mocks.recordAuthoringIncident.mockResolvedValue(undefined);
  mocks.resolveAuthoringIncident.mockResolvedValue(undefined);
  mocks.streamWrite.mockResolvedValue(undefined);
});

describe("authoring progress persistence incidents", () => {
  it("resolves the same stable-step incident after persistence succeeds on retry", async () => {
    const persistenceError = new Error("temporary event store failure");
    mocks.persistRunEvent
      .mockRejectedValueOnce(persistenceError)
      .mockResolvedValueOnce({ id: "event-1", seq: 1, inserted: true });

    await expect(emitProgress(ref, event)).rejects.toBe(persistenceError);
    expect(mocks.recordAuthoringIncident).toHaveBeenCalledWith({
      runId: ref.dbRunId,
      projectId: ref.projectId,
      category: "event_persistence",
      severity: "critical",
      dedupeKey: "event-persistence:stable-workflow-step",
      evidence: {
        eventType: "stage",
        stage: "outline",
      },
    });
    expect(mocks.resolveAuthoringIncident).not.toHaveBeenCalled();
    expect(mocks.streamWrite).not.toHaveBeenCalled();

    await expect(emitProgress(ref, event)).resolves.toBeUndefined();
    expect(mocks.resolveAuthoringIncident).toHaveBeenCalledWith({
      runId: ref.dbRunId,
      dedupeKey: "event-persistence:stable-workflow-step",
    });
    expect(mocks.streamWrite).toHaveBeenCalledOnce();
  });
});

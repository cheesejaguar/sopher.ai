import { describe, expect, it } from "vitest";

import { recommendAdminRunAction, summarizeAdminRunCheckpoints } from "@/lib/admin/run-operations";
import type { RunHealth } from "@/lib/run-health";

const RUN_ID = "11111111-1111-4111-8111-111111111111";

function health(overrides: Partial<RunHealth> = {}): RunHealth {
  return {
    databaseStatus: "running",
    workflowStatus: "running",
    effectiveStatus: "running",
    acceptedAt: "2026-07-30T12:00:00.000Z",
    startedAt: "2026-07-30T12:00:01.000Z",
    completedAt: null,
    workflowStartedAt: "2026-07-30T12:00:01.000Z",
    workflowCompletedAt: null,
    lastEventAt: "2026-07-30T12:01:00.000Z",
    heartbeatAt: "2026-07-30T12:01:00.000Z",
    lastUpdateAt: "2026-07-30T12:01:00.000Z",
    elapsedMs: 60_000,
    estimatedMinutes: 20,
    stage: "chapters",
    progressPct: 40,
    stageDescription: "Drafting chapters",
    chapters: { total: 3, planned: 3, drafting: 1, drafted: 1, edited: 0, final: 0 },
    spend: { meteredUsd: 0.25, creditsUsed: 0.8 },
    authoringBegan: true,
    noWorkStarted: false,
    acceptanceUncertain: false,
    safeToRetry: false,
    completionArtifactsReady: false,
    health: "healthy",
    dispatchAttempts: 1,
    workflowMissingCount: 0,
    workflowMissingSince: null,
    cancellation: null,
    pause: null,
    savedChapterCount: 1,
    savedCheckpointCount: 4,
    supportReference: "22222222-2222-4222-8222-222222222222",
    rootErrorCode: null,
    rootErrorStage: null,
    ...overrides,
  };
}

describe("admin run operations", () => {
  it("summarizes durable checkpoints without returning author content", () => {
    const summary = summarizeAdminRunCheckpoints(RUN_ID, {
      protocolVersion: 2,
      dispatchReady: true,
      stagedConcept: { premise: "private" },
      stagedOutline: { chapters: [{ summary: "private" }] },
      preparation: { manuscriptReset: true, conceptPersisted: true },
      manuscriptPrepared: true,
      work: {
        chapters: {
          "1": {
            scenePlan: { beats: ["private"] },
            draft: "private manuscript",
            result: { content: "private manuscript", wordCount: 2 },
          },
          "2": { draft: "private manuscript" },
        },
        edits: { "1": { content: "private manuscript" } },
      },
      completion: {
        chapterSummaries: { "1": { sourceRunId: RUN_ID, contentDigest: "digest" } },
        continuityOutcomes: { plot: { sourceRunId: RUN_ID } },
        finalized: { sourceRunId: RUN_ID, manuscriptDigest: "digest" },
      },
    });

    expect(summary).toMatchObject({
      protocolVersion: 2,
      dispatchReady: true,
      preparationSteps: 2,
      manuscriptPrepared: true,
      chapterPlans: 1,
      chapterDrafts: 2,
      chapterResults: 1,
      editedChapterResults: 1,
      chapterSummaries: 1,
      continuityPhases: 1,
      finalized: true,
      finalizationOwnedByRun: true,
      completionDigestRecorded: true,
    });
    expect(JSON.stringify(summary)).not.toContain("private");
  });

  it("prefers cancellation confirmation over every other action", () => {
    const result = recommendAdminRunAction({
      health: health({
        cancellation: {
          requestedAt: "2026-07-30T12:01:00.000Z",
          reason: "author requested",
        },
        health: "critical",
      }),
      acceptedInputCount: 1,
      hasOpenCriticalIncident: true,
    });

    expect(result.kind).toBe("confirm_cancellation");
  });

  it("redelivers only accepted durable input for the active pause", () => {
    const result = recommendAdminRunAction({
      health: health({
        databaseStatus: "awaiting_input",
        effectiveStatus: "awaiting_input",
        pause: {
          kind: "outline_approval",
          version: 2,
          registeredAt: "2026-07-30T12:00:00.000Z",
          details: null,
        },
      }),
      acceptedInputCount: 1,
      hasOpenCriticalIncident: false,
    });

    expect(result.kind).toBe("redeliver_input");
  });

  it("permits same-run redispatch only for uncertain zero-work dispatch", () => {
    const result = recommendAdminRunAction({
      health: health({
        databaseStatus: "queued",
        workflowStatus: "missing",
        effectiveStatus: "queued",
        authoringBegan: false,
        noWorkStarted: true,
        acceptanceUncertain: true,
        dispatchAttempts: 2,
        savedChapterCount: 0,
      }),
      acceptedInputCount: 0,
      hasOpenCriticalIncident: false,
    });

    expect(result.kind).toBe("redispatch");
  });

  it("requires completion investigation when terminal proof contradicts artifacts", () => {
    const result = recommendAdminRunAction({
      health: health({
        databaseStatus: "completed",
        workflowStatus: "completed",
        effectiveStatus: "failed",
        completedAt: "2026-07-30T12:30:00.000Z",
        workflowCompletedAt: "2026-07-30T12:30:00.000Z",
        completionArtifactsReady: false,
      }),
      acceptedInputCount: 0,
      hasOpenCriticalIncident: true,
    });

    expect(result.kind).toBe("investigate_completion");
  });
});

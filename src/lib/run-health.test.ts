import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  authoringReconciliationCandidateCondition,
  canonicalRunProgress,
  classifyRunHealth,
  completedFullBookProjectionRepairPlan,
  completionArtifactsAreReady,
  countSavedAuthoringCheckpoints,
  deriveEffectiveRunStatus,
  deriveWorkflowMissingObservationTransition,
  hasConclusiveMissingWorkflowEvidence,
  normalizeRunTimestamp,
  reconcileAuthoringRun,
  redeliverAcceptedInputForWatchdog,
  RUN_HEARTBEAT_CRITICAL_MS,
  RUN_HEARTBEAT_WARNING_MS,
  RUN_MISSING_TERMINAL_EVIDENCE_MS,
  fullBookCompletionEvidence,
  runCompletionArtifactsAreReady,
  summarizeChapterRowsForRun,
  workflowCompletionRequiresArtifacts,
  type RunHealth,
} from "@/lib/run-health";

describe("completed Workflow reconciliation", () => {
  it("honors a cancellation-resolved terminal transition instead of claiming completion", async () => {
    const health: RunHealth = {
      databaseStatus: "running",
      workflowStatus: "completed",
      effectiveStatus: "completed",
      acceptedAt: "2026-07-30T12:00:00.000Z",
      startedAt: "2026-07-30T12:00:01.000Z",
      completedAt: null,
      workflowStartedAt: "2026-07-30T12:00:01.000Z",
      workflowCompletedAt: "2026-07-30T12:01:00.000Z",
      lastEventAt: "2026-07-30T12:00:59.000Z",
      heartbeatAt: "2026-07-30T12:00:59.000Z",
      lastUpdateAt: "2026-07-30T12:01:00.000Z",
      elapsedMs: 60_000,
      estimatedMinutes: null,
      stage: "chapters",
      progressPct: 99,
      stageDescription: "Chapter output saved",
      chapters: {
        total: 1,
        planned: 0,
        drafting: 0,
        drafted: 1,
        edited: 0,
        final: 0,
      },
      spend: { meteredUsd: 0.2, creditsUsed: 0.6 },
      authoringBegan: true,
      noWorkStarted: false,
      acceptanceUncertain: false,
      safeToRetry: false,
      completionArtifactsReady: true,
      completionEvidence: null,
      health: "warning",
      dispatchAttempts: 1,
      workflowMissingCount: 0,
      workflowMissingSince: null,
      cancellation: {
        requestedAt: "2026-07-30T12:00:59.500Z",
        reason: "Cancelled by author",
      },
      pause: null,
      savedChapterCount: 1,
      savedCheckpointCount: 1,
      supportReference: "11111111-1111-4111-8111-111111111111",
      rootErrorCode: null,
      rootErrorStage: null,
    };
    const transitionRun = vi.fn().mockResolvedValue({
      status: "cancelled",
      transitioned: true,
    });

    await expect(
      reconcileAuthoringRun(
        {
          id: "run-1",
          projectId: "project-1",
          userId: "user-1",
          kind: "chapter",
          config: { protocolVersion: 2 },
        } as never,
        {
          getHealth: vi.fn().mockResolvedValue(health),
          transitionRun,
        },
      ),
    ).resolves.toEqual({
      runId: "run-1",
      outcome: "cancelled",
      workflowStatus: "completed",
    });
    expect(transitionRun).toHaveBeenCalledWith({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      status: "completed",
      resolveCancellationOnComplete: true,
    });
  });
});

describe("saved authoring checkpoint count", () => {
  it("counts resumable work and completion boundaries without reading their content", () => {
    expect(
      countSavedAuthoringCheckpoints({
        stagedConcept: { title: "Stored concept" },
        preparation: {
          manuscriptReset: true,
          entityCanonReset: true,
        },
        work: {
          conceptExpanded: { premise: "Stored premise" },
          chapters: {
            "1": {
              scenePlan: { scenes: [] },
              draft: "Checkpointed prose",
              result: { content: "Applied prose" },
            },
            "2": { draft: "" },
          },
          edits: {
            "1": { content: "Edited prose" },
          },
        },
        completion: {
          entityBible: { sourceRunId: "run-1", entityCount: 2, relationshipCount: 1 },
          chapterSummaries: {
            "1": { sourceRunId: "run-1", contentDigest: "sha256:summary" },
          },
          editedChapters: {
            "1": {
              sourceRunId: "run-1",
              contentDigest: "sha256:edit",
              changed: true,
            },
          },
          continuityOutcomes: {
            plot: {
              sourceRunId: "run-1",
              manuscriptDigest: "sha256:manuscript",
              outcome: {},
            },
          },
          finalized: { sourceRunId: "run-1", manuscriptDigest: "sha256:final" },
        },
      }),
    ).toBe(14);
    expect(countSavedAuthoringCheckpoints(null)).toBe(0);
  });
});

describe("watchdog durable input redelivery", () => {
  it.each(["outline_approval", "credits_topup"] as const)(
    "redelivers an accepted v2 %s response through the durable input helper",
    async (kind) => {
      const findAcceptedInputId = vi.fn().mockResolvedValue("input-1");
      const redeliver = vi.fn().mockResolvedValue("delivered");

      await expect(
        redeliverAcceptedInputForWatchdog(
          {
            runId: "run-1",
            config: { protocolVersion: 2 },
            databaseStatus: "awaiting_input",
            effectiveStatus: "awaiting_input",
            cancellation: null,
            pause: {
              kind,
              version: 3,
              registeredAt: "2026-07-30T12:00:00.000Z",
              details: null,
            },
          },
          { findAcceptedInputId, redeliver },
        ),
      ).resolves.toBe("delivered");

      expect(findAcceptedInputId).toHaveBeenCalledWith({
        runId: "run-1",
        kind,
        pauseVersion: 3,
      });
      expect(redeliver).toHaveBeenCalledWith({ inputId: "input-1" });
    },
  );

  it.each([
    {
      name: "a deployment-pinned v1 pause",
      config: {},
      databaseStatus: "awaiting_input" as const,
      effectiveStatus: "awaiting_input" as const,
      cancellation: null,
    },
    {
      name: "a terminal effective status",
      config: { protocolVersion: 2 as const },
      databaseStatus: "awaiting_input" as const,
      effectiveStatus: "failed" as const,
      cancellation: null,
    },
    {
      name: "a cancellation request",
      config: { protocolVersion: 2 as const },
      databaseStatus: "awaiting_input" as const,
      effectiveStatus: "awaiting_input" as const,
      cancellation: { requestedAt: "2026-07-30T12:01:00.000Z", reason: null },
    },
  ])("does not redeliver $name", async (testCase) => {
    const findAcceptedInputId = vi.fn().mockResolvedValue("input-1");
    const redeliver = vi.fn().mockResolvedValue("delivered");

    await expect(
      redeliverAcceptedInputForWatchdog(
        {
          runId: "run-1",
          config: testCase.config,
          databaseStatus: testCase.databaseStatus,
          effectiveStatus: testCase.effectiveStatus,
          cancellation: testCase.cancellation,
          pause: {
            kind: "outline_approval",
            version: 1,
            registeredAt: "2026-07-30T12:00:00.000Z",
            details: null,
          },
        },
        { findAcceptedInputId, redeliver },
      ),
    ).resolves.toBe("not_eligible");

    expect(findAcceptedInputId).not.toHaveBeenCalled();
    expect(redeliver).not.toHaveBeenCalled();
  });

  it("leaves a v2 pause alone when no accepted answer is pending delivery", async () => {
    const findAcceptedInputId = vi.fn().mockResolvedValue(null);
    const redeliver = vi.fn().mockResolvedValue("delivered");

    await expect(
      redeliverAcceptedInputForWatchdog(
        {
          runId: "run-1",
          config: { protocolVersion: 2 },
          databaseStatus: "awaiting_input",
          effectiveStatus: "awaiting_input",
          cancellation: null,
          pause: {
            kind: "credits_topup",
            version: 2,
            registeredAt: "2026-07-30T12:00:00.000Z",
            details: null,
          },
        },
        { findAcceptedInputId, redeliver },
      ),
    ).resolves.toBe("not_eligible");

    expect(redeliver).not.toHaveBeenCalled();
  });
});

describe("canonicalRunProgress", () => {
  const stageEvent = {
    stage: "chapters" as const,
    progressPct: 54,
    stageDescription: "Drafting chapter 3",
    createdAt: new Date("2026-07-30T12:00:00.000Z"),
  };

  it("uses a newer terminal projection instead of a stale stage event", () => {
    expect(
      canonicalRunProgress({
        effectiveStatus: "failed",
        persisted: {
          stage: "failed",
          progressPct: 54,
          stageDescription: "The provider could not finish",
          lastProgressAt: new Date("2026-07-30T12:01:00.000Z"),
        },
        event: stageEvent,
      }),
    ).toEqual({
      stage: "failed",
      progressPct: 54,
      stageDescription: "The provider could not finish",
    });
  });

  it("uses a newer persisted cancellation projection", () => {
    expect(
      canonicalRunProgress({
        effectiveStatus: "cancelled",
        persisted: {
          stage: "cancelled",
          progressPct: 54,
          stageDescription: "Cancelled",
          lastProgressAt: new Date("2026-07-30T12:01:00.000Z"),
        },
        event: stageEvent,
      }),
    ).toMatchObject({ stage: "cancelled", stageDescription: "Cancelled" });
  });

  it("keeps a newer legacy stage event when the persisted projection has not caught up", () => {
    expect(
      canonicalRunProgress({
        effectiveStatus: "running",
        persisted: {
          stage: "queued",
          progressPct: 0,
          stageDescription: null,
          lastProgressAt: null,
        },
        event: stageEvent,
      }),
    ).toMatchObject({ stage: "chapters", progressPct: 54 });
  });

  it.each([
    {
      effectiveStatus: "completed" as const,
      eventStage: "done" as const,
      expectedStage: "done" as const,
      expectedPct: 100,
    },
    {
      effectiveStatus: "failed" as const,
      eventStage: "failed" as const,
      expectedStage: "failed" as const,
      expectedPct: 54,
    },
    {
      effectiveStatus: "cancelled" as const,
      eventStage: "cancelled" as const,
      expectedStage: "cancelled" as const,
      expectedPct: 54,
    },
  ])(
    "normalizes a pinned-v1 $effectiveStatus run whose persisted projection is stale",
    ({ effectiveStatus, eventStage, expectedStage, expectedPct }) => {
      expect(
        canonicalRunProgress({
          effectiveStatus,
          persisted: {
            stage: "chapters",
            progressPct: 41,
            stageDescription: "Drafting chapter 2",
            lastProgressAt: new Date("2026-07-30T11:59:00.000Z"),
          },
          event: {
            stage: eventStage,
            progressPct: 54,
            stageDescription: `Legacy run ${effectiveStatus}`,
            createdAt: new Date("2026-07-30T12:01:00.000Z"),
          },
        }),
      ).toEqual({
        stage: expectedStage,
        progressPct: expectedPct,
        stageDescription: `Legacy run ${effectiveStatus}`,
      });
    },
  );
});

describe("normalizeRunTimestamp", () => {
  it("decodes Neon raw aggregate timestamps before health date arithmetic", () => {
    const iso = "2026-07-30T19:29:00.000Z";

    expect(normalizeRunTimestamp(iso)?.toISOString()).toBe(iso);
    expect(normalizeRunTimestamp(new Date(iso))?.toISOString()).toBe(iso);
    expect(normalizeRunTimestamp(null)).toBeNull();
    expect(normalizeRunTimestamp("not-a-timestamp")).toBeNull();
  });
});

describe("deriveEffectiveRunStatus", () => {
  it.each(["pending", "missing", "unavailable"] as const)(
    "never terminalizes an active database run for a %s Workflow lookup",
    (workflowStatus) => {
      expect(
        deriveEffectiveRunStatus({
          databaseStatus: "queued",
          workflowStatus,
          completionArtifactsReady: false,
        }),
      ).toBe("queued");
    },
  );

  it("does not demote an awaiting-input run while Workflow is running", () => {
    expect(
      deriveEffectiveRunStatus({
        databaseStatus: "awaiting_input",
        workflowStatus: "running",
        completionArtifactsReady: false,
      }),
    ).toBe("awaiting_input");
  });

  it("reflects a proven terminal Workflow failure", () => {
    expect(
      deriveEffectiveRunStatus({
        databaseStatus: "queued",
        workflowStatus: "failed",
        completionArtifactsReady: false,
      }),
    ).toBe("failed");
  });

  it("requires manuscript artifacts before accepting Workflow completion", () => {
    expect(
      deriveEffectiveRunStatus({
        databaseStatus: "running",
        workflowStatus: "completed",
        completionArtifactsReady: false,
      }),
    ).toBe("failed");
    expect(
      deriveEffectiveRunStatus({
        databaseStatus: "running",
        workflowStatus: "completed",
        completionArtifactsReady: true,
      }),
    ).toBe("completed");
  });

  it("requires kind-specific proof for scoped completed Workflows", () => {
    expect(
      deriveEffectiveRunStatus({
        databaseStatus: "running",
        workflowStatus: "completed",
        completionArtifactsReady: false,
        workflowCompletionRequiresArtifacts: true,
      }),
    ).toBe("failed");
    expect(workflowCompletionRequiresArtifacts("chapter")).toBe(true);
    expect(workflowCompletionRequiresArtifacts("edit_pass")).toBe(true);
    expect(workflowCompletionRequiresArtifacts("continuity")).toBe(true);
    expect(workflowCompletionRequiresArtifacts("full_book")).toBe(true);
  });

  it("does not overwrite an existing database terminal state", () => {
    expect(
      deriveEffectiveRunStatus({
        databaseStatus: "cancelled",
        workflowStatus: "completed",
        completionArtifactsReady: true,
      }),
    ).toBe("cancelled");
  });

  it("treats a completed database row without run-owned artifacts as contradictory", () => {
    expect(
      deriveEffectiveRunStatus({
        databaseStatus: "completed",
        workflowStatus: "completed",
        completionArtifactsReady: false,
        workflowCompletionRequiresArtifacts: true,
      }),
    ).toBe("failed");
  });
});

describe("missing Workflow evidence", () => {
  const now = new Date("2026-07-30T12:10:00.000Z");

  it("preserves one evidence window through unavailable probes, then resets on a real state", () => {
    const firstObservedAt = new Date("2026-07-30T12:00:00.000Z");
    const first = deriveWorkflowMissingObservationTransition({
      status: "missing",
      currentCount: 0,
      currentSince: null,
      observedAt: firstObservedAt,
    });
    expect(first).toEqual({
      mode: "increment",
      nextCount: 1,
      nextSince: firstObservedAt,
    });

    const unavailable = deriveWorkflowMissingObservationTransition({
      status: "unavailable",
      currentCount: first.nextCount,
      currentSince: first.nextSince,
      observedAt: new Date("2026-07-30T12:04:00.000Z"),
    });
    expect(unavailable).toEqual({
      mode: "preserve",
      nextCount: 1,
      nextSince: firstObservedAt,
    });

    const secondMissing = deriveWorkflowMissingObservationTransition({
      status: "missing",
      currentCount: unavailable.nextCount,
      currentSince: unavailable.nextSince,
      observedAt: new Date("2026-07-30T12:06:00.000Z"),
    });
    expect(secondMissing).toEqual({
      mode: "increment",
      nextCount: 2,
      nextSince: firstObservedAt,
    });

    expect(
      deriveWorkflowMissingObservationTransition({
        status: "running",
        currentCount: secondMissing.nextCount,
        currentSince: secondMissing.nextSince,
        observedAt: now,
      }),
    ).toEqual({
      mode: "reset",
      nextCount: 0,
      nextSince: null,
    });
  });

  it("requires three observations spanning at least ten minutes", () => {
    expect(
      hasConclusiveMissingWorkflowEvidence({
        count: 2,
        since: new Date(now.getTime() - RUN_MISSING_TERMINAL_EVIDENCE_MS),
        now,
      }),
    ).toBe(false);
    expect(
      hasConclusiveMissingWorkflowEvidence({
        count: 3,
        since: new Date(now.getTime() - RUN_MISSING_TERMINAL_EVIDENCE_MS + 1),
        now,
      }),
    ).toBe(false);
    expect(
      hasConclusiveMissingWorkflowEvidence({
        count: 3,
        since: new Date(now.getTime() - RUN_MISSING_TERMINAL_EVIDENCE_MS),
        now,
      }),
    ).toBe(true);
  });

  it("does not treat a malformed or absent first observation as conclusive", () => {
    expect(hasConclusiveMissingWorkflowEvidence({ count: 9, since: null, now })).toBe(false);
    expect(
      hasConclusiveMissingWorkflowEvidence({
        count: 9,
        since: "unparseable",
        now,
      }),
    ).toBe(false);
  });
});

describe("classifyRunHealth", () => {
  const now = new Date("2026-07-30T12:30:00.000Z");
  const base = {
    databaseStatus: "running" as const,
    workflowStatus: "running" as const,
    acceptedAt: new Date("2026-07-30T12:00:00.000Z"),
    cancellationRequestedAt: null,
    now,
  };

  it("classifies fixed heartbeat warning and critical boundaries exactly", () => {
    expect(
      classifyRunHealth({
        ...base,
        lastUpdateAt: new Date(now.getTime() - RUN_HEARTBEAT_WARNING_MS + 1),
      }),
    ).toBe("healthy");
    expect(
      classifyRunHealth({
        ...base,
        lastUpdateAt: new Date(now.getTime() - RUN_HEARTBEAT_WARNING_MS),
      }),
    ).toBe("warning");
    expect(
      classifyRunHealth({
        ...base,
        lastUpdateAt: new Date(now.getTime() - RUN_HEARTBEAT_CRITICAL_MS),
      }),
    ).toBe("critical");
  });

  it("becomes critical at twice the remaining estimate without waiting thirty minutes", () => {
    expect(
      classifyRunHealth({
        ...base,
        lastUpdateAt: new Date(now.getTime() - 9 * 60_000),
        remainingEstimateMs: 5 * 60_000,
      }),
    ).toBe("healthy");
    expect(
      classifyRunHealth({
        ...base,
        lastUpdateAt: new Date(now.getTime() - 10 * 60_000),
        remainingEstimateMs: 5 * 60_000,
      }),
    ).toBe("critical");
  });

  it("reports a transient Workflow probe failure as degraded without implying a stop", () => {
    expect(
      classifyRunHealth({
        ...base,
        workflowStatus: "unavailable",
        lastUpdateAt: new Date(now.getTime() - 60_000),
      }),
    ).toBe("degraded");
  });

  it("keeps terminal database rows healthy even when their final heartbeat is old", () => {
    expect(
      classifyRunHealth({
        ...base,
        databaseStatus: "completed",
        lastUpdateAt: new Date(now.getTime() - 24 * 60 * 60_000),
      }),
    ).toBe("healthy");
  });
});

describe("completionArtifactsAreReady", () => {
  const config = {
    protocolVersion: 2 as const,
    targetChapters: 3,
    completion: {
      finalized: {
        sourceRunId: "run-1",
        manuscriptDigest: "sha256:complete",
      },
    },
  };

  it("requires the durable finalization marker, project timestamp, and every chapter", () => {
    expect(
      completionArtifactsAreReady({
        runId: "run-1",
        config,
        projectCompletedAt: new Date(),
        finalChapterCount: 3,
      }),
    ).toBe(true);
    expect(
      completionArtifactsAreReady({
        runId: "run-1",
        config,
        projectCompletedAt: new Date(),
        finalChapterCount: 2,
      }),
    ).toBe(false);
    expect(
      completionArtifactsAreReady({
        runId: "run-1",
        config: { protocolVersion: 2, targetChapters: 3 },
        projectCompletedAt: new Date(),
        finalChapterCount: 3,
      }),
    ).toBe(false);
    expect(
      completionArtifactsAreReady({
        runId: "run-1",
        config,
        projectCompletedAt: null,
        finalChapterCount: 3,
      }),
    ).toBe(false);
    expect(
      completionArtifactsAreReady({
        runId: "different-run",
        config,
        projectCompletedAt: new Date(),
        finalChapterCount: 3,
      }),
    ).toBe(false);
  });

  it("accepts the pre-v2 completion evidence that pinned workflows could persist", () => {
    expect(
      completionArtifactsAreReady({
        runId: "legacy-run",
        config: { targetChapters: 3 },
        projectCompletedAt: new Date(),
        finalChapterCount: 3,
      }),
    ).toBe(true);
    expect(
      completionArtifactsAreReady({
        runId: "legacy-run",
        config: { protocolVersion: 1, targetChapters: 3 },
        projectCompletedAt: new Date(),
        finalChapterCount: 2,
      }),
    ).toBe(false);
    expect(
      completionArtifactsAreReady({
        runId: "legacy-run",
        config: { protocolVersion: 1, targetChapters: 3 },
        projectCompletedAt: null,
        finalChapterCount: 3,
      }),
    ).toBe(false);
  });

  it("keeps terminal completion proof stable after supported manuscript restructuring", () => {
    expect(
      completionArtifactsAreReady({
        runId: "run-1",
        config,
        projectCompletedAt: new Date(),
        finalChapterCount: 0,
        databaseStatus: "completed",
      }),
    ).toBe(true);
    expect(
      completionArtifactsAreReady({
        runId: "legacy-run",
        config: { protocolVersion: 1, targetChapters: 3 },
        projectCompletedAt: new Date(),
        finalChapterCount: 0,
        databaseStatus: "completed",
      }),
    ).toBe(true);
  });
});

describe("completed full-book watchdog coverage", () => {
  const completeConfig = {
    protocolVersion: 2 as const,
    targetChapters: 3,
    completion: {
      finalized: {
        sourceRunId: "run-1",
        manuscriptDigest: "sha256:complete",
      },
    },
  };

  it("selects every completed full-book row without prefiltering on JSON proof", () => {
    const sqlText = new PgDialect().sqlToQuery(
      authoringReconciliationCandidateCondition().getSQL() as never,
    ).sql;

    expect(sqlText).toContain('"generation_runs"."status" in');
    expect(sqlText).toContain('"generation_runs"."status" =');
    expect(sqlText).toContain('"generation_runs"."kind" =');
    expect(sqlText).not.toContain("completion");
    expect(sqlText).not.toContain("manuscriptDigest");
  });

  it("repairs a missing project completion timestamp only from conclusive run-owned proof", () => {
    const evidence = fullBookCompletionEvidence({
      runId: "run-1",
      config: completeConfig,
      projectCompletedAt: null,
      projectStatus: "generating",
      finalChapterCount: 3,
    });

    expect(
      completedFullBookProjectionRepairPlan({
        runKind: "full_book",
        runCompletedAt: "2026-07-30T12:30:00.000Z",
        evidence,
      }),
    ).toEqual({
      conclusive: true,
      repairCompletedAt: true,
      repairStatus: true,
      completedAt: new Date("2026-07-30T12:30:00.000Z"),
    });
  });

  it("keeps a valid legacy completion and repairs only its denormalized project status", () => {
    const evidence = fullBookCompletionEvidence({
      runId: "legacy-run",
      config: { targetChapters: 3 },
      projectCompletedAt: new Date("2026-07-30T12:00:00.000Z"),
      projectStatus: "generating",
      finalChapterCount: 3,
    });

    expect(evidence).toMatchObject({
      requiresRunOwnedFinalization: false,
      runOwnedFinalization: false,
      legacyCompletionCompatible: true,
      finalChaptersComplete: true,
      projectCompletedAt: true,
    });
    expect(
      completedFullBookProjectionRepairPlan({
        runKind: "full_book",
        runCompletedAt: "2026-07-30T12:30:00.000Z",
        evidence,
      }),
    ).toMatchObject({
      conclusive: true,
      repairCompletedAt: false,
      repairStatus: true,
    });
  });

  it("uses durable finalization after chapter edits but rejects foreign proof or no run timestamp", () => {
    const truncated = fullBookCompletionEvidence({
      runId: "run-1",
      config: completeConfig,
      projectCompletedAt: null,
      projectStatus: "generating",
      finalChapterCount: 2,
    });
    const foreign = fullBookCompletionEvidence({
      runId: "other-run",
      config: completeConfig,
      projectCompletedAt: null,
      projectStatus: "generating",
      finalChapterCount: 3,
    });
    const completeWithoutProjectTimestamp = fullBookCompletionEvidence({
      runId: "run-1",
      config: completeConfig,
      projectCompletedAt: null,
      projectStatus: "generating",
      finalChapterCount: 3,
    });

    expect(
      completedFullBookProjectionRepairPlan({
        runKind: "full_book",
        runCompletedAt: "2026-07-30T12:30:00.000Z",
        evidence: truncated,
      }).conclusive,
    ).toBe(true);

    for (const [evidence, runCompletedAt] of [
      [foreign, "2026-07-30T12:30:00.000Z"],
      [completeWithoutProjectTimestamp, null],
    ] as const) {
      expect(
        completedFullBookProjectionRepairPlan({
          runKind: "full_book",
          runCompletedAt,
          evidence,
        }).conclusive,
      ).toBe(false);
    }
  });
});

describe("runCompletionArtifactsAreReady", () => {
  it("accepts only a chapter checkpoint owned by the completed run", () => {
    const base = {
      kind: "chapter",
      projectCompletedAt: null,
      finalChapterCount: 0,
      config: {
        completion: {
          chapterSummaries: {
            "2": { sourceRunId: "run-chapter", contentDigest: "sha256:chapter" },
          },
        },
      },
    };

    expect(runCompletionArtifactsAreReady({ ...base, runId: "run-chapter" })).toBe(true);
    expect(runCompletionArtifactsAreReady({ ...base, runId: "different-run" })).toBe(false);
  });

  it("recognizes run-owned edit and continuity completion checkpoints", () => {
    expect(
      runCompletionArtifactsAreReady({
        runId: "run-edit",
        kind: "edit_pass",
        projectCompletedAt: null,
        finalChapterCount: 0,
        config: {
          completion: {
            editedChapters: {
              "1": {
                sourceRunId: "run-edit",
                contentDigest: "sha256:edit",
                changed: false,
              },
            },
          },
        },
      }),
    ).toBe(true);

    expect(
      runCompletionArtifactsAreReady({
        runId: "run-continuity",
        kind: "continuity",
        projectCompletedAt: null,
        finalChapterCount: 0,
        config: {
          completion: {
            continuityReport: {
              sourceRunId: "run-continuity",
              manuscriptDigest: "sha256:manuscript",
              report: {} as never,
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("accepts a run-owned manuscript review even when it correctly produced zero suggestions", () => {
    const config = {
      tier: "standard" as const,
      editPass: {
        completion: {
          sourceRunId: "run-review",
          reviewedChapterCount: 5,
          suggestionCount: 0,
          completedAt: "2026-08-02T20:00:00.000Z",
        },
      },
    };

    expect(
      runCompletionArtifactsAreReady({
        runId: "run-review",
        kind: "edit_pass",
        projectCompletedAt: null,
        finalChapterCount: 0,
        config,
      }),
    ).toBe(true);
    expect(
      runCompletionArtifactsAreReady({
        runId: "another-run",
        kind: "edit_pass",
        projectCompletedAt: null,
        finalChapterCount: 0,
        config,
      }),
    ).toBe(false);
  });
});

describe("summarizeChapterRowsForRun", () => {
  it("scopes a shorter rerun to its exact target instead of counting retired chapters", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      chapterNumber: index + 1,
      status: "final",
      contentReady: true,
    }));

    const summary = summarizeChapterRowsForRun(rows, 6);
    expect(summary.chapters).toMatchObject({ total: 6, final: 6 });
    expect(summary.finalChapterContentCount).toBe(6);
    expect(
      completionArtifactsAreReady({
        runId: "run-shorter",
        config: {
          protocolVersion: 2,
          targetChapters: 6,
          completion: {
            finalized: {
              sourceRunId: "run-shorter",
              manuscriptDigest: "sha256:shorter",
            },
          },
        },
        projectCompletedAt: new Date(),
        finalChapterCount: summary.finalChapterContentCount,
      }),
    ).toBe(true);
  });
});

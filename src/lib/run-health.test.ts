import { describe, expect, it } from "vitest";

import {
  completionArtifactsAreReady,
  deriveEffectiveRunStatus,
  runCompletionArtifactsAreReady,
  summarizeChapterRowsForRun,
  workflowCompletionRequiresArtifacts,
} from "@/lib/run-health";

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
});

describe("completionArtifactsAreReady", () => {
  const config = {
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
        config,
        projectCompletedAt: new Date(),
        finalChapterCount: 3,
      }),
    ).toBe(true);
    expect(
      completionArtifactsAreReady({
        config,
        projectCompletedAt: new Date(),
        finalChapterCount: 2,
      }),
    ).toBe(false);
    expect(
      completionArtifactsAreReady({
        config: { targetChapters: 3 },
        projectCompletedAt: new Date(),
        finalChapterCount: 3,
      }),
    ).toBe(false);
    expect(
      completionArtifactsAreReady({
        config,
        projectCompletedAt: null,
        finalChapterCount: 3,
      }),
    ).toBe(false);
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
        config: {
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

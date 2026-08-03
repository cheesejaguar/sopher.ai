import { describe, expect, it } from "vitest";

import {
  describeCancellationProgress,
  describeProductionProgress,
  isActiveProductionProgress,
  isProjectProgressSnapshot,
  lifecyclePhaseForProduction,
  type ProductionStage,
} from "@/lib/project-progress";

describe("project production progress", () => {
  it.each([
    ["concept", "Plan"],
    ["awaiting_approval", "Plan"],
    ["bible", "Produce"],
    ["chapters", "Produce"],
    ["continuity", "Refine"],
    ["revising", "Refine"],
    ["finalizing", "Publish"],
    ["done", "Publish"],
  ] satisfies [ProductionStage, string][])("maps %s to %s", (stage, phase) => {
    expect(lifecyclePhaseForProduction(stage)).toBe(phase);
  });

  it("maps a credit pause to the phase that will resume", () => {
    expect(lifecyclePhaseForProduction("awaiting_credits", "outline")).toBe("Plan");
    expect(lifecyclePhaseForProduction("awaiting_credits", "editing")).toBe("Refine");
    expect(lifecyclePhaseForProduction("awaiting_credits", "revising")).toBe("Refine");
  });

  it("describes chapter assembly with real completed counts", () => {
    expect(
      describeProductionProgress({
        runId: "run-1",
        stage: "chapters",
        pct: 42,
        draftedCount: 4,
        totalChapters: 12,
      }),
    ).toBe("Drafting chapters · 4 of 12 assembled");
  });

  it("describes production with stage facts rather than orchestration percentages", () => {
    expect(
      describeProductionProgress({
        runId: "run-1",
        stage: "continuity",
        pct: 85,
        detail: "Reviewing character and timeline consistency",
        draftedCount: 12,
        totalChapters: 12,
      }),
    ).toBe("Checking continuity · Reviewing character and timeline consistency");

    expect(
      describeProductionProgress({
        runId: "run-1",
        stage: "done",
        pct: 100,
        draftedCount: 12,
        totalChapters: 12,
      }),
    ).toBe("Manuscript complete");
  });

  it("names the exact phase paused for credits without presenting a completion estimate", () => {
    expect(
      describeProductionProgress({
        runId: "run-1",
        stage: "awaiting_credits",
        pausedStage: "continuity",
        pct: 85,
        detail: "Add credits to continue",
        draftedCount: 12,
        totalChapters: 12,
      }),
    ).toBe("Waiting for credits before checking continuity · Add credits to continue");
  });

  it("describes a cancellation request as one transitional state", () => {
    expect(
      describeCancellationProgress({
        runId: "run-1",
        stage: "chapters",
        pct: 37,
        draftedCount: 1,
        totalChapters: 3,
      }),
    ).toBe("Stopping safely after Chapters · 37%");

    expect(
      describeCancellationProgress({
        runId: "run-1",
        stage: "awaiting_credits",
        pausedStage: "continuity",
        pct: 85,
        draftedCount: 3,
        totalChapters: 3,
      }),
    ).toBe("Stopping safely after Continuity · 85%");
  });

  it.each(["done", "failed", "cancelled"] as const)(
    "stops background refreshes after %s",
    (stage) => {
      expect(
        isActiveProductionProgress({
          runId: "run-1",
          stage,
          pct: 100,
          draftedCount: 4,
          totalChapters: 12,
        }),
      ).toBe(false);
    },
  );

  it("keeps background refreshes active for paused and running production", () => {
    for (const stage of ["awaiting_approval", "awaiting_credits", "chapters"] as const) {
      expect(
        isActiveProductionProgress({
          runId: "run-1",
          stage,
          pct: 42,
          draftedCount: 4,
          totalChapters: 12,
        }),
      ).toBe(true);
    }
  });

  it("validates the lightweight progress API boundary", () => {
    expect(
      isProjectProgressSnapshot({
        runId: "run-1",
        stage: "chapters",
        pct: 42,
        detail: "4 of 12 chapters drafted",
        cancellationRequestedAt: "2026-07-30T12:05:00.000Z",
        draftedCount: 4,
        totalChapters: 12,
      }),
    ).toBe(true);
    expect(
      isProjectProgressSnapshot({
        runId: "run-1",
        stage: "awaiting_credits",
        pausedStage: "awaiting_credits",
        pct: 85,
        draftedCount: 12,
        totalChapters: 12,
      }),
    ).toBe(false);
    expect(
      isProjectProgressSnapshot({
        runId: "run-1",
        stage: "awaiting_credits",
        pausedStage: "continuity",
        pct: 85,
        draftedCount: 12,
        totalChapters: 12,
      }),
    ).toBe(true);
    expect(
      isProjectProgressSnapshot({
        runId: "run-1",
        stage: "invented",
        pct: 42,
        draftedCount: 4,
        totalChapters: 12,
      }),
    ).toBe(false);
    expect(
      isProjectProgressSnapshot({
        runId: "run-1",
        stage: "chapters",
        pct: 42,
        cancellationRequestedAt: "not-a-timestamp",
        draftedCount: 4,
        totalChapters: 12,
      }),
    ).toBe(false);
  });
});

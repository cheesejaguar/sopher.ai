import { describe, expect, it } from "vitest";

import { projectMeteringCandidates, unresolvedMeteringCandidate } from "./unresolved-metering";

const baseRun = {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  userId: "author-1",
  kind: "full_book",
  config: {},
};

describe("unresolvedMeteringCandidate", () => {
  it.each(["queued", "running", "awaiting_input", "completed"])(
    "does not treat a %s run's in-flight intent as unsafe recovery evidence",
    (status) => {
      expect(unresolvedMeteringCandidate({ ...baseRun, status })).toBeNull();
    },
  );

  it("uses the current run for a terminal root attempt", () => {
    expect(unresolvedMeteringCandidate({ ...baseRun, status: "failed" })).toMatchObject({
      lineageRunId: baseRun.id,
      intentPrefix: `metering-intent:generation:${baseRun.id}:`,
    });
  });

  it("follows the preserved billing lineage across recovery attempts", () => {
    const lineageRunId = "33333333-3333-4333-8333-333333333333";
    expect(
      unresolvedMeteringCandidate({
        ...baseRun,
        status: "cancelled",
        config: { billingLineageRunId: lineageRunId },
      }),
    ).toMatchObject({
      lineageRunId,
      intentPrefix: `metering-intent:generation:${lineageRunId}:`,
    });
  });
});

describe("projectMeteringCandidates", () => {
  it("keeps the newest full book plus every terminal standalone continuity run", () => {
    const runs = [
      { ...baseRun, id: "full-new", status: "completed" },
      { ...baseRun, id: "continuity-failed", kind: "continuity", status: "failed" },
      { ...baseRun, id: "continuity-complete", kind: "continuity", status: "completed" },
      { ...baseRun, id: "full-old", status: "failed" },
      { ...baseRun, id: "continuity-cancelled", kind: "continuity", status: "cancelled" },
    ];

    expect(projectMeteringCandidates(runs).map((run) => run.id)).toEqual([
      "full-new",
      "continuity-failed",
      "continuity-cancelled",
    ]);
  });
});

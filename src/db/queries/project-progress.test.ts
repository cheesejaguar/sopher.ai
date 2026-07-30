import { describe, expect, it } from "vitest";

import { resolveRunProgress } from "./project-progress";

describe("resolveRunProgress", () => {
  it.each([
    ["completed", "done", 100],
    ["failed", "failed", 64],
    ["cancelled", "cancelled", 64],
  ] as const)(
    "gives terminal %s status precedence over a stale stage event",
    (status, expectedStage, expectedPct) => {
      expect(
        resolveRunProgress(status, {
          stage: "chapters",
          pct: 64,
          detail: "Drafting chapter 7",
        }),
      ).toEqual({
        stage: expectedStage,
        pct: expectedPct,
        detail: undefined,
      });
    },
  );

  it.each([
    ["completed", "done", 100, "The manuscript is ready"],
    ["failed", "failed", 72, "Continuity review could not finish"],
    ["cancelled", "cancelled", 38, "Production was stopped"],
  ] as const)(
    "preserves detail from a matching %s terminal event",
    (status, stage, pct, detail) => {
      expect(resolveRunProgress(status, { stage, pct, detail })).toEqual({
        stage,
        pct,
        detail,
      });
    },
  );

  it("continues to use the latest stage event for a non-terminal run", () => {
    expect(
      resolveRunProgress("running", {
        stage: "editing",
        pct: 81,
        detail: "Tightening chapter prose",
      }),
    ).toEqual({
      stage: "editing",
      pct: 81,
      detail: "Tightening chapter prose",
    });
  });

  it("preserves the concrete phase behind a credit pause", () => {
    expect(
      resolveRunProgress("awaiting_input", {
        stage: "awaiting_credits",
        pct: 85,
        detail: "Credits needed to continue review",
        resumeStage: "continuity",
      }),
    ).toEqual({
      stage: "awaiting_credits",
      pct: 85,
      detail: "Credits needed to continue review",
      pausedStage: "continuity",
    });
  });
});

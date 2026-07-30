import { describe, expect, it } from "vitest";

import { projectProgressForRun } from "./run-viewer";

describe("projectProgressForRun", () => {
  it("preserves the concrete stage paused by an awaiting-credits gate", () => {
    expect(
      projectProgressForRun(
        {
          stage: "awaiting_credits",
          pausedStage: "editing",
          pct: 72,
          detail: "Add credits to continue",
        },
        12,
        12,
      ),
    ).toEqual({
      stage: "awaiting_credits",
      pausedStage: "editing",
      pct: 72,
      detail: "Add credits to continue",
      draftedCount: 12,
      totalChapters: 12,
    });
  });
});

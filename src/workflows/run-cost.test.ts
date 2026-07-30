import { describe, expect, it } from "vitest";

import { runCostEvent } from "./run-cost";

describe("runCostEvent", () => {
  it("reports idempotent ledger debits separately from repeated provider attempts", () => {
    expect(runCostEvent(4.5, 8.25)).toEqual({
      type: "cost",
      totalUsd: 4.5,
      totalCredits: 8.25,
    });
  });
});

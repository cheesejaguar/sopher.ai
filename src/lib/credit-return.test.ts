import { describe, expect, it } from "vitest";

import { creditReturnRunId, creditReturnWithoutRun, creditReturnWithRun } from "./credit-return";

const RUN_ID = "22222222-2222-4222-8222-222222222222";

describe("credit return continuity", () => {
  it("preserves the durable run reference inside Stripe's validated return path", () => {
    const carried = creditReturnWithRun(
      "/projects/11111111-1111-4111-8111-111111111111/write?panel=progress",
      RUN_ID,
    );

    expect(carried).toBe(
      `/projects/11111111-1111-4111-8111-111111111111/write?panel=progress&resumeRun=${RUN_ID}`,
    );
    expect(creditReturnRunId(undefined, carried)).toBe(RUN_ID);
  });

  it("removes a resolved run without disturbing the rest of the return path", () => {
    expect(
      creditReturnWithoutRun(`/projects/book/write?panel=progress&resumeRun=${RUN_ID}#production`),
    ).toBe("/projects/book/write?panel=progress#production");
  });

  it("rejects malformed embedded references before the ownership query", () => {
    expect(creditReturnRunId(undefined, "/projects/book/write?resumeRun=not-a-uuid")).toBeNull();
  });
});

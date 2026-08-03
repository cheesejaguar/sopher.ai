import { describe, expect, it } from "vitest";

import { ProjectSpendAccessError } from "@/lib/project-spend-access";

import { projectSpendAccessErrorResponse } from "./project-spend-http";

describe("project spend HTTP errors", () => {
  it.each([
    ["purchase_required", 402],
    ["trial_busy", 409],
    ["included_allowance_exhausted", 409],
    ["suspended", 403],
    ["project_not_found", 404],
  ] as const)("maps %s to an actionable response", async (code, status) => {
    const response = projectSpendAccessErrorResponse(
      new ProjectSpendAccessError(code, `message for ${code}`),
    );
    expect(response?.status).toBe(status);
    await expect(response?.json()).resolves.toMatchObject({ code });
  });

  it("leaves unrelated failures to the route", () => {
    expect(projectSpendAccessErrorResponse(new Error("database unavailable"))).toBeNull();
  });
});

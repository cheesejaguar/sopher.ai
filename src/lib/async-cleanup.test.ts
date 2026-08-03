import { describe, expect, it, vi } from "vitest";

import { withPreservedPrimaryError } from "./async-cleanup";

describe("withPreservedPrimaryError", () => {
  it("preserves the initiating error when cleanup also fails", async () => {
    const initiating = new Error("provider failed");
    const cleanup = new Error("reservation release failed");
    const onSuppressed = vi.fn();

    await expect(
      withPreservedPrimaryError(
        async () => {
          throw initiating;
        },
        async () => {
          throw cleanup;
        },
        onSuppressed,
      ),
    ).rejects.toBe(initiating);
    expect(onSuppressed).toHaveBeenCalledWith(cleanup);
  });

  it("propagates cleanup failure after successful work", async () => {
    const cleanup = new Error("reservation release failed");
    await expect(
      withPreservedPrimaryError(
        async () => "written",
        async () => {
          throw cleanup;
        },
      ),
    ).rejects.toBe(cleanup);
  });

  it("returns the result after successful cleanup", async () => {
    await expect(
      withPreservedPrimaryError(
        async () => "written",
        async () => {},
      ),
    ).resolves.toBe("written");
  });
});

import { describe, expect, it } from "vitest";

import { canAttachToWholeBookRun } from "./write-experience";

describe("canAttachToWholeBookRun", () => {
  it("accepts a newly queued full-book run", () => {
    expect(canAttachToWholeBookRun(202, "run-1", undefined)).toBe(true);
  });

  it("reattaches only to an existing full-book run", () => {
    expect(canAttachToWholeBookRun(409, "run-1", "full_book")).toBe(true);
    expect(canAttachToWholeBookRun(409, "run-2", "chapter")).toBe(false);
    expect(canAttachToWholeBookRun(409, "run-3", "edit_pass")).toBe(false);
  });

  it("never attaches without a run id", () => {
    expect(canAttachToWholeBookRun(202, undefined, "full_book")).toBe(false);
  });
});

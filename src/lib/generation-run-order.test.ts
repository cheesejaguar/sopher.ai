import { describe, expect, it } from "vitest";

import { completedRunIsLater } from "./generation-run-order";

describe("completedRunIsLater", () => {
  it("uses completion time before creation time and a deterministic id tie-break", () => {
    const source = {
      id: "10000000-0000-4000-8000-000000000001",
      completedAt: new Date("2026-08-10T10:00:00Z"),
      createdAt: new Date("2026-08-10T09:00:00Z"),
    };
    expect(
      completedRunIsLater(
        {
          id: "00000000-0000-4000-8000-000000000001",
          completedAt: new Date("2026-08-10T11:00:00Z"),
          createdAt: new Date("2026-08-10T08:00:00Z"),
        },
        source,
      ),
    ).toBe(true);
    expect(
      completedRunIsLater(
        {
          ...source,
          id: "20000000-0000-4000-8000-000000000001",
        },
        source,
      ),
    ).toBe(true);
  });
});

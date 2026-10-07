// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

// The completion card imports a server action; Next compiles that to a
// reference, but vitest would load the real server module graph.
vi.mock("@/lib/actions/continuity", () => ({ startConsistencyReview: vi.fn() }));

import { announcementFor } from "./run-viewer";

describe("included-story production messaging", () => {
  it("never tells a screen-reader user to purchase credits for the included story", () => {
    expect(announcementFor("awaiting_credits", 1, 3, "trial_short_story")).toMatch(
      /no purchase is required/i,
    );
    expect(announcementFor("awaiting_credits", 1, 3, "trial_short_story")).not.toMatch(
      /add credits/i,
    );
    expect(announcementFor("done", 3, 3, "trial_short_story")).toBe("The story is written.");
  });
});

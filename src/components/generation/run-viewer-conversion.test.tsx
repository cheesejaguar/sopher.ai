// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

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

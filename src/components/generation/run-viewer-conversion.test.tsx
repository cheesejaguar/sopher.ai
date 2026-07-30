// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { announcementFor, IncludedStoryNextStep } from "./run-viewer";

afterEach(cleanup);

describe("IncludedStoryNextStep", () => {
  it("keeps the current story card-free while offering the future full-book unlock", () => {
    render(<IncludedStoryNextStep projectId="trial-project" fullBookUnlocked={false} />);

    expect(screen.getByText(/does not require a card/i)).toBeVisible();
    expect(screen.getByText(/one settled credit purchase permanently unlocks/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Unlock the full-length version" })).toHaveAttribute(
      "href",
      "/studio/credits?return=%2Fstudio%2Fnew%3Ffrom%3Dtrial-project",
    );
    expect(screen.getByText(/title, genre, and brief carry/i)).toBeVisible();
  });

  it("never tells a screen-reader user to purchase credits for the included story", () => {
    expect(announcementFor("awaiting_credits", 1, 3, "trial_short_story")).toMatch(
      /no purchase is required/i,
    );
    expect(announcementFor("awaiting_credits", 1, 3, "trial_short_story")).not.toMatch(
      /add credits/i,
    );
    expect(announcementFor("done", 3, 3, "trial_short_story")).toBe("The story is written.");
  });

  it("recognizes an unlock that has already settled", () => {
    render(<IncludedStoryNextStep projectId="trial-project" fullBookUnlocked />);

    expect(screen.getByText("This story is ready to go full length.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue at full length" })).toHaveAttribute(
      "href",
      "/studio/new?from=trial-project",
    );
    expect(screen.queryByText(/settled credit purchase/i)).not.toBeInTheDocument();
  });
});

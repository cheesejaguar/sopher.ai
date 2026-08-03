// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreditsBanner } from "./credits-banner";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CreditsBanner", () => {
  it("keeps purchase optional when an included story pauses", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 402,
      json: async () => ({ error: "balance empty" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CreditsBanner projectId="trial-project" runId="trial-run" experience="trial_short_story" />,
    );

    expect(screen.getByText("Production paused before the included story finished.")).toBeVisible();
    expect(screen.getByText(/does not require a card/i)).toBeVisible();
    expect(screen.getByText(/purchase is optional here/i)).toBeVisible();
    expect(screen.getByText(/permanently unlocks/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Get help" })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:support@sopher.ai"),
    );
    expect(screen.queryByRole("button", { name: /credits/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your included story should not need a purchase",
      ),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retains the top-up path for paid full-book production", () => {
    render(
      <CreditsBanner
        projectId="book-project"
        runId="book-run"
        detail="Chapter wave could not be reserved"
      />,
    );

    expect(screen.getByText("Writing is paused — out of credits.")).toBeVisible();
    expect(screen.getByText(/continues exactly where it stopped once you top up/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Add credits" })).toHaveAttribute(
      "href",
      "/studio/credits?return=%2Fprojects%2Fbook-project%2Fwrite&resumeRun=book-run",
    );
    expect(screen.queryByRole("button", { name: /resume writing/i })).not.toBeInTheDocument();
  });
});

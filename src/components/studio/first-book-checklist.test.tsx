// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthoringOnboardingSnapshot } from "@/lib/authoring-onboarding-shared";

import { StudioInlineChecklist } from "./first-book-checklist";

const track = vi.fn();
const snapshot: AuthoringOnboardingSnapshot = {
  version: 1,
  dismissed: false,
  seenCoachmarks: [],
  completedCount: 1,
  steps: [
    {
      id: "shape_idea",
      label: "Shape your idea",
      description: "Give the story a working title, genre, and brief.",
      complete: true,
      href: "/projects/project-1/brief",
    },
    {
      id: "start_production",
      label: "Start production",
      description: "Send the brief to the writing room.",
      complete: false,
      href: "/projects/project-1/write",
    },
  ],
};

vi.mock("@/lib/analytics/track", () => ({
  track: (...args: unknown[]) => track(...args),
}));

beforeEach(() => {
  track.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        ...snapshot,
        dismissed: JSON.parse(String(init?.body)).dismissed,
      }),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StudioInlineChecklist", () => {
  it("shows replayable first-book progress directly on Studio without opening Help", () => {
    render(<StudioInlineChecklist initialSnapshot={snapshot} />);

    expect(screen.getByRole("region", { name: "First-book guidance" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Your first book" })).toBeVisible();
    expect(screen.getByText(/1 of 2 milestones complete/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /start production/i })).toHaveAttribute(
      "href",
      "/projects/project-1/write",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("expands the full roadmap from its compact mobile milestone", () => {
    render(<StudioInlineChecklist initialSnapshot={snapshot} />);

    const completedStep = screen.getByRole("link", { name: /shape your idea/i });
    expect(completedStep.closest("li")).toHaveClass("hidden");

    const disclosure = screen.getByRole("button", { name: "View all milestones" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(disclosure);

    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(completedStep.closest("li")).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Show current milestone only" })).toBeVisible();
  });

  it("persists a reversible dismissal from the inline surface", async () => {
    render(<StudioInlineChecklist initialSnapshot={snapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(await screen.findByText("First-book checklist is hidden")).toBeVisible();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/onboarding",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "dismiss_checklist", dismissed: true }),
        }),
      ),
    );
    expect(track).toHaveBeenCalledWith("onboarding_checklist_changed", { dismissed: true });
  });
});

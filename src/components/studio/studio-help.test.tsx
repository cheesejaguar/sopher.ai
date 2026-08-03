// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthoringOnboardingSnapshot } from "@/lib/authoring-onboarding-shared";

import { StudioHelp } from "./studio-help";

const track = vi.fn();
const snapshot: AuthoringOnboardingSnapshot = {
  version: 1,
  dismissed: false,
  seenCoachmarks: [],
  completedCount: 3,
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
      complete: true,
      href: "/projects/project-1/write",
    },
    {
      id: "review_outline",
      label: "Review the outline",
      description: "Approve the story plan.",
      complete: true,
      href: "/projects/project-1/outline",
    },
    {
      id: "watch_chapters",
      label: "Watch the chapters arrive",
      description: "Follow production progress.",
      complete: false,
      href: "/projects/project-1/write",
    },
    {
      id: "edit_manuscript",
      label: "Make the manuscript yours",
      description: "Edit the prose.",
      complete: false,
      href: "/projects/project-1/editor",
    },
    {
      id: "read_or_export",
      label: "Read or export",
      description: "Open the continuous manuscript.",
      complete: false,
      href: "/projects/project-1/manuscript",
    },
    {
      id: "continue_full_length",
      label: "Continue at full length",
      description: "Carry the story into a full-length setup.",
      complete: false,
      href: "/studio/credits?return=%2Fstudio%2Fnew",
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
      json: async () =>
        init?.method === "POST"
          ? {
              ...snapshot,
              dismissed: JSON.parse(String(init.body)).dismissed,
            }
          : snapshot,
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StudioHelp", () => {
  it("opens on guidance for the current production surface and shows durable progress", async () => {
    render(<StudioHelp open onOpenChange={vi.fn()} pathname="/projects/project-1/write" />);

    expect(screen.getByRole("heading", { name: "Help with this page" })).toBeVisible();
    expect(await screen.findByText(/3 of 7 milestones complete/i)).toBeVisible();
    expect(screen.getByText("Production, pauses, and recovery")).toBeVisible();
    expect(screen.getByText(/last confirmed stage/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /make the manuscript yours/i })).toHaveAttribute(
      "href",
      "/projects/project-1/editor",
    );
    expect(track).toHaveBeenCalledWith("help_opened", { area: "production" });
  });

  it("persists checklist dismissal without blocking the help topics", async () => {
    render(<StudioHelp open onOpenChange={vi.fn()} pathname="/studio" />);
    await screen.findByText(/3 of 7 milestones complete/i);

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(await screen.findByText("First-book checklist is hidden")).toBeVisible();
    expect(screen.getByText("Help topics")).toBeVisible();
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

  it("surfaces an accessible craft guide for the current project genre", async () => {
    render(
      <StudioHelp
        open
        onOpenChange={vi.fn()}
        pathname="/projects/project-1/brief"
        genre="science_fiction"
      />,
    );
    await screen.findByText(/3 of 7 milestones complete/i);

    expect(screen.getByRole("button", { name: "Science Fiction craft guide" })).toHaveAttribute(
      "href",
      "/genres/science-fiction",
    );
    expect(screen.getByRole("button", { name: "All writing guides" })).toHaveAttribute(
      "href",
      "/guides",
    );
  });

  it("copies the owned run statuses and support reference without manuscript content", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/journey")) {
          return {
            ok: true,
            json: async () => ({
              journey: {
                run: {
                  id: "22222222-2222-4222-8222-222222222222",
                  databaseStatus: "failed",
                  workflowStatus: "failed",
                  effectiveStatus: "failed",
                  stage: "failed",
                  acceptedAt: "2026-07-30T12:00:00.000Z",
                  lastUpdateAt: "2026-07-30T12:04:00.000Z",
                  supportReference: "33333333-3333-4333-8333-333333333333",
                },
              },
            }),
          };
        }
        return { ok: true, json: async () => snapshot };
      }),
    );

    render(
      <StudioHelp
        open
        onOpenChange={vi.fn()}
        pathname="/projects/11111111-1111-4111-8111-111111111111/write"
      />,
    );
    await screen.findByText(/3 of 7 milestones complete/i);
    fireEvent.click(screen.getByRole("button", { name: "Copy support details" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = String(writeText.mock.calls[0]?.[0]);
    expect(copied).toContain("Database status: failed");
    expect(copied).toContain("Support reference: 33333333-3333-4333-8333-333333333333");
    expect(copied).not.toMatch(/brief|manuscript|chapter prose/i);
  });
});

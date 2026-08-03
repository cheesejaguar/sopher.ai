// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateProject: vi.fn(),
}));

vi.mock("@/lib/actions/projects", () => ({
  updateProject: mocks.updateProject,
}));

import { ProjectSettingsForm } from "./project-settings-form";

beforeEach(() => {
  mocks.updateProject.mockReset();
  mocks.updateProject.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("ProjectSettingsForm", () => {
  it("keeps the author's edited values in the form after a successful save", async () => {
    render(
      <ProjectSettingsForm
        projectId="project-1"
        defaults={{
          genre: "fantasy",
          targetChapters: 10,
          targetWordsPerChapter: 2_000,
          styleGuide: "Keep the prose direct.",
          settings: {
            qualityTier: "standard",
            pov: "third_limited",
            tense: "past",
            heatLevel: "none",
            violenceLevel: "mild",
            profanity: "mild",
          },
        }}
      />,
    );

    const chapters = screen.getByLabelText("Chapters");
    const tone = screen.getByLabelText("Tone");
    const autopilot = screen.getByRole("radio", { name: /autopilot/i });
    fireEvent.change(chapters, { target: { value: "14" } });
    fireEvent.change(tone, { target: { value: "Hopeful and strange" } });
    fireEvent.click(autopilot);
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(mocks.updateProject).toHaveBeenCalledOnce());
    expect(mocks.updateProject).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        targetChapters: 14,
        settings: expect.objectContaining({
          tone: "Hopeful and strange",
          authoringMode: "autopilot",
        }),
      }),
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved."));
    expect(chapters).toHaveValue(14);
    expect(tone).toHaveValue("Hopeful and strange");
  });

  it("keeps the included story shape read-only while preserving creative controls", async () => {
    render(
      <ProjectSettingsForm
        projectId="trial-project"
        experience="trial_short_story"
        defaults={{
          genre: "fantasy",
          targetChapters: 3,
          targetWordsPerChapter: 1_000,
          styleGuide: "",
          settings: {
            qualityTier: "standard",
            pov: "third_limited",
            tense: "past",
          },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Included short-story shape" })).toBeVisible();
    expect(screen.queryByLabelText("Chapters")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Words per chapter")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Quality tier")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Point of view")).toBeVisible();
    expect(screen.getByRole("radio", { name: /collaborative/i })).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: /pause for my approval before writing chapters/i,
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: /pause for my approval before writing chapters/i,
      }),
    ).toBeDisabled();
    expect(screen.getByText(/included stories always pause here/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /unlock full-length controls/i })).toHaveAttribute(
      "href",
      "/studio/credits?return=%2Fstudio%2Fnew%3Ffrom%3Dtrial-project",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(mocks.updateProject).toHaveBeenCalledWith(
        "trial-project",
        expect.objectContaining({
          targetChapters: 3,
          targetWordsPerChapter: 1_000,
          settings: expect.objectContaining({
            qualityTier: "standard",
            requireOutlineApproval: true,
          }),
        }),
      ),
    );
  });
});

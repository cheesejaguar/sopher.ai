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
    fireEvent.change(chapters, { target: { value: "14" } });
    fireEvent.change(tone, { target: { value: "Hopeful and strange" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(mocks.updateProject).toHaveBeenCalledOnce());
    expect(mocks.updateProject).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        targetChapters: 14,
        settings: expect.objectContaining({ tone: "Hopeful and strange" }),
      }),
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved."));
    expect(chapters).toHaveValue(14);
    expect(tone).toHaveValue("Hopeful and strange");
  });
});

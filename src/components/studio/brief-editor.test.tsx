// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BriefEditor } from "./brief-editor";

const mocks = vi.hoisted(() => ({
  updateProject: vi.fn(),
}));

vi.mock("@/lib/actions/projects", () => ({
  updateProject: mocks.updateProject,
}));

beforeEach(() => {
  mocks.updateProject.mockReset();
});

afterEach(cleanup);

describe("BriefEditor", () => {
  it("preserves an entered brief after local validation rejects it", async () => {
    render(<BriefEditor projectId="project-1" brief="An existing sufficiently long brief." />);

    fireEvent.click(screen.getByRole("button", { name: "Edit the brief" }));
    const brief = screen.getByRole("textbox", { name: "Brief" });
    fireEvent.change(brief, { target: { value: "Too short" } });
    fireEvent.click(screen.getByRole("button", { name: "Save brief" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A brief needs at least 20 characters.",
    );
    expect(brief).toHaveValue("Too short");
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it("preserves the entered brief and focused action after an async save failure", async () => {
    mocks.updateProject.mockRejectedValue(new Error("network"));
    render(<BriefEditor projectId="project-1" brief="An existing sufficiently long brief." />);

    fireEvent.click(screen.getByRole("button", { name: "Edit the brief" }));
    const brief = screen.getByRole("textbox", { name: "Brief" });
    const save = screen.getByRole("button", { name: "Save brief" });
    const revision = "A replacement brief that is definitely long enough.";
    fireEvent.change(brief, { target: { value: revision } });
    save.focus();
    fireEvent.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
    expect(brief).toHaveValue(revision);
    expect(save).toHaveFocus();
  });
});

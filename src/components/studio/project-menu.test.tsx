// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectMenu } from "./project-menu";

const mocks = vi.hoisted(() => ({
  deleteProject: vi.fn(),
  setProjectArchived: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock("@/lib/actions/projects", () => mocks);

beforeEach(() => {
  mocks.deleteProject.mockReset();
  mocks.setProjectArchived.mockReset();
  mocks.updateProject.mockReset();
});

afterEach(cleanup);

describe("ProjectMenu rename", () => {
  it("preserves the proposed title and focus after an async rename failure", async () => {
    mocks.updateProject.mockRejectedValue(new Error("network"));
    render(<ProjectMenu projectId="project-1" title="Old title" />);

    fireEvent.click(screen.getByRole("button", { name: "Actions for Old title" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));

    const title = await screen.findByRole("textbox", { name: "Title" });
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.change(title, { target: { value: "A better title" } });
    save.focus();
    fireEvent.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not rename");
    expect(title).toHaveValue("A better title");
    expect(save).toHaveFocus();
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BookIdentityDialog } from "./book-identity-dialog";

const mocks = vi.hoisted(() => ({
  updateBook: vi.fn(),
}));

vi.mock("@/lib/actions/books", () => ({
  updateBook: mocks.updateBook,
}));

beforeEach(() => {
  mocks.updateBook.mockReset();
});

afterEach(cleanup);

describe("BookIdentityDialog", () => {
  it("preserves edited details and focus after an async save failure", async () => {
    mocks.updateBook.mockRejectedValue(new Error("network"));
    render(
      <BookIdentityDialog
        projectId="project-1"
        title="Old title"
        synopsis="Old synopsis"
        author="Old author"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit title, synopsis, and author" }));
    const title = await screen.findByRole("textbox", { name: "Title" });
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.change(title, { target: { value: "A better title" } });
    save.focus();
    fireEvent.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
    expect(title).toHaveValue("A better title");
    expect(save).toHaveFocus();
  });
});

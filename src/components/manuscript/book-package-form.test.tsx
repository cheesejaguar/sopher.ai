// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BookPackageForm } from "./book-package-form";

const mocks = vi.hoisted(() => ({
  updateBookPackage: vi.fn(),
}));

vi.mock("@/lib/actions/books", () => ({
  updateBookPackage: mocks.updateBookPackage,
}));

function renderForm() {
  return render(
    <>
      <a href="/studio">Return to Studio</a>
      <BookPackageForm
        projectId="project-1"
        title="The First Draft"
        synopsis="An old synopsis"
        matter={{ author: "A. Writer", coverUrl: "https://assets.example.test/cover.png" }}
      />
    </>,
  );
}

beforeEach(() => {
  mocks.updateBookPackage.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BookPackageForm", () => {
  it("clears Saved as soon as a new edit is made and protects unsaved navigation", async () => {
    mocks.updateBookPackage.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderForm();

    const title = screen.getByRole("textbox", { name: "Title" });
    const save = screen.getByRole("button", { name: "Save book package" });
    expect(save.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(title, { target: { value: "The Last Draft" } });

    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    const reload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(reload);
    expect(reload.defaultPrevented).toBe(true);

    expect(fireEvent.click(screen.getByRole("link", { name: "Return to Studio" }))).toBe(false);
    expect(confirm).toHaveBeenCalledWith(
      "Leave this page? Your unsaved book package changes will be lost.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("button", { name: "Saved" })).toBeEnabled();
    expect(
      screen.getByText("Saved. New exports and reader editions will include these details."),
    ).toBeInTheDocument();
    expect(mocks.updateBookPackage).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        title: "The Last Draft",
        author: "A. Writer",
      }),
    );

    const savedReload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(savedReload);
    expect(savedReload.defaultPrevented).toBe(false);

    fireEvent.change(screen.getByRole("textbox", { name: "Author byline" }), {
      target: { value: "B. Writer" },
    });
    expect(
      screen.queryByText("Saved. New exports and reader editions will include these details."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("keeps failed changes visible, guarded, and retryable", async () => {
    mocks.updateBookPackage
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(undefined);
    renderForm();

    const synopsis = screen.getByRole("textbox", { name: "Synopsis" });
    fireEvent.change(synopsis, { target: { value: "A synopsis worth keeping" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The book package could not be saved",
    );
    expect(synopsis).toHaveValue("A synopsis worth keeping");
    expect(await screen.findByRole("button", { name: "Save changes" })).toBeEnabled();

    const reload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(reload);
    expect(reload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("button", { name: "Saved" })).toBeEnabled();
    expect(mocks.updateBookPackage).toHaveBeenCalledTimes(2);
  });

  it("does not let an older successful response mark a newer edit as saved", async () => {
    let resolveSave: (() => void) | undefined;
    mocks.updateBookPackage.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderForm();

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Submitted title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("button", { name: "Saving book package…" })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Subtitle" }), {
      target: { value: "Edited while saving" },
    });
    await act(async () => {
      resolveSave?.();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(
      screen.queryByText("Saved. New exports and reader editions will include these details."),
    ).not.toBeInTheDocument();
  });
});

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HashFocusTarget } from "@/components/studio/hash-focus-target";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    { width: 100, height: 40 },
  ] as unknown as DOMRectList);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  window.history.replaceState({}, "", "/studio");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HashFocusTarget", () => {
  it("focuses a visible target on initial cross-page hash navigation", async () => {
    window.history.replaceState({}, "", "/projects/project-id/editor#editor-production-status");

    render(
      <HashFocusTarget
        id="editor-production-status"
        role="region"
        aria-label="Editor production status"
      >
        Editor status
      </HashFocusTarget>,
    );

    const target = screen.getByRole("region", { name: "Editor production status" });
    expect(target).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(target).toHaveFocus());
  });

  it("focuses the target after a same-page hash change", async () => {
    render(
      <HashFocusTarget as="header" id="manuscript-actions">
        Manuscript actions
      </HashFocusTarget>,
    );
    const target = screen.getByText("Manuscript actions");
    expect(target).not.toHaveFocus();

    window.history.pushState({}, "", "/projects/project-id/manuscript#manuscript-actions");
    window.dispatchEvent(new Event("hashchange"));

    await waitFor(() => expect(target).toHaveFocus());
  });

  it("does not focus a retained hidden route target", async () => {
    window.history.replaceState({}, "", "/projects/project-id/write#production-status");
    vi.mocked(HTMLElement.prototype.getClientRects).mockReturnValue([] as unknown as DOMRectList);

    render(<HashFocusTarget id="production-status">Production status</HashFocusTarget>);

    const target = screen.getByText("Production status");
    await waitFor(() => expect(target).not.toHaveFocus());
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EmptyLibrary } from "./empty-library";

afterEach(cleanup);

describe("EmptyLibrary", () => {
  it("leads a new eligible author into the complete included story before the purchase step", () => {
    const { container } = render(<EmptyLibrary mode="included_story" />);

    expect(container.firstElementChild).toHaveClass("instrument-surface");
    expect(container.firstElementChild).not.toHaveClass("instrument-surface-raised");
    expect(screen.getByRole("heading", { name: /complete short story/i })).toBeVisible();
    expect(screen.getByText(/complete Studio, story bible, editor/i)).toBeVisible();
    expect(screen.getByText(/one settled credit purchase permanently unlocks/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /create my included story/i })).toHaveAttribute(
      "href",
      "/studio/new",
    );
    expect(screen.queryByText("Included story / no card")).not.toBeInTheDocument();
  });

  it("sends a returning locked author directly to the permanent full-book unlock", () => {
    render(<EmptyLibrary mode="purchase_required" />);

    expect(
      screen.getByRole("heading", { name: /unlock your next full-length book/i }),
    ).toBeVisible();
    expect(screen.getByText(/permanently unlocks full-length chapter count/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /view credit packs/i })).toHaveAttribute(
      "href",
      "/studio/credits?return=%2Fstudio%2Fnew",
    );
    expect(screen.queryByText("Full-length production")).not.toBeInTheDocument();
  });
});

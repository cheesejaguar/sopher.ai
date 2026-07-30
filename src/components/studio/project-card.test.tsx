// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NewBookCard } from "./project-card";

afterEach(cleanup);

describe("NewBookCard", () => {
  it("offers an optional permanent full-book unlock after the included story exists", () => {
    render(<NewBookCard unlockFullBooks sourceProjectId="trial-project" />);

    const link = screen.getByRole("link", { name: /take your story to full length/i });
    expect(link).toHaveAttribute(
      "href",
      "/studio/credits?return=%2Fstudio%2Fnew%3Ffrom%3Dtrial-project",
    );
    expect(screen.getByText(/does not require a card/i)).toBeVisible();
    expect(screen.getByText(/one settled credit purchase permanently unlocks/i)).toBeVisible();
    expect(screen.getByText(/title, genre, and brief will carry/i)).toBeVisible();
  });

  it("keeps the ordinary new-book path for unlocked accounts", () => {
    render(<NewBookCard />);

    expect(screen.getByRole("link", { name: /start a new book/i })).toHaveAttribute(
      "href",
      "/studio/new",
    );
    expect(screen.queryByText(/settled credit purchase/i)).not.toBeInTheDocument();
  });
});

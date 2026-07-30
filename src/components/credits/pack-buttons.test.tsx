// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PackButtons } from "./pack-buttons";

afterEach(cleanup);

describe("PackButtons", () => {
  it("gives every checkout choice a distinct, complete accessible name", () => {
    render(
      <PackButtons
        packs={[
          { id: "starter", name: "Starter", credits: 12, usd: 5, bonus: 0 },
          { id: "author", name: "Author", credits: 30, usd: 10, bonus: 0.1 },
        ]}
        returnTo="/studio/new"
      />,
    );

    expect(screen.getByRole("button", { name: "Buy Starter: 12 credits for $5" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Buy Author: 30 credits for $10" })).toBeVisible();
  });

  it("guides a first purchase toward enough room for a typical full-length book", () => {
    render(
      <PackButtons
        packs={[
          { id: "starter", name: "Starter", credits: 25, usd: 25, bonus: 0 },
          { id: "author", name: "Author", credits: 66, usd: 60, bonus: 0.1 },
        ]}
        returnTo="/studio/new?from=trial-project"
        unlockingFullBook
      />,
    );

    expect(screen.getByText("Recommended")).toBeVisible();
    expect(screen.getByText(/covers the illustrative 36,000-word Standard book/i)).toBeVisible();
    expect(screen.getAllByText(/exact quote before anything runs/i)).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Buy Author: 66 credits for $60" }),
    ).toHaveTextContent("Choose Author");
  });
});

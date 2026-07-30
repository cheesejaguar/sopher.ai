// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PurchaseReturnStatus } from "./purchase-return-status";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  refresh.mockReset();
});

describe("PurchaseReturnStatus", () => {
  it("waits for the authoritative Stripe webhook before continuing", () => {
    render(<PurchaseReturnStatus unlocked={false} continueTo="/studio/new" />);

    expect(screen.getByRole("heading", { name: "Payment received." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirming purchase…" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /continue to full-length setup/i }),
    ).not.toBeInTheDocument();
  });

  it("continues directly into a fresh full-length setup after settlement", () => {
    render(<PurchaseReturnStatus unlocked continueTo="/studio/new" />);

    expect(screen.getByRole("heading", { name: /full-length books are unlocked/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /continue to full-length setup/i })).toHaveAttribute(
      "href",
      "/studio/new",
    );
  });

  it("returns a trial author to the carried-forward version of their story", () => {
    render(
      <PurchaseReturnStatus
        unlocked
        continueTo="/studio/new?from=11111111-1111-4111-8111-111111111111"
      />,
    );

    expect(
      screen.getByRole("heading", { name: /story is ready to go full length/i }),
    ).toBeVisible();
    expect(screen.getByText(/title, genre, and brief already carried/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Continue this story at full length" }),
    ).toHaveAttribute("href", "/studio/new?from=11111111-1111-4111-8111-111111111111");
  });
});

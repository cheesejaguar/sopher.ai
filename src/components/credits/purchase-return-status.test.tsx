// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { Route } from "next";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PurchaseReturnStatus } from "./purchase-return-status";

const refresh = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
}));

afterEach(() => {
  cleanup();
  refresh.mockReset();
  replace.mockReset();
  vi.unstubAllGlobals();
});

describe("PurchaseReturnStatus", () => {
  it("waits for the authoritative Stripe webhook before continuing", () => {
    render(<PurchaseReturnStatus purchaseConfirmed={false} continueTo="/studio/new" />);

    expect(screen.getByRole("heading", { name: "Confirming purchase." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirming purchase…" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /continue to full-length setup/i }),
    ).not.toBeInTheDocument();
  });

  it("continues directly into a fresh full-length setup after settlement", () => {
    render(<PurchaseReturnStatus purchaseConfirmed continueTo="/studio/new" />);

    expect(screen.getByRole("heading", { name: /full-length books are unlocked/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /continue to full-length setup/i })).toHaveAttribute(
      "href",
      "/studio/new",
    );
  });

  it("returns a trial author to the carried-forward version of their story", () => {
    render(
      <PurchaseReturnStatus
        purchaseConfirmed
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

  it("returns an underfunded setup to its final confirmation", () => {
    render(<PurchaseReturnStatus purchaseConfirmed continueTo="/studio/new?resume=checkout" />);

    expect(screen.getByRole("heading", { name: "Your balance is ready." })).toBeVisible();
    expect(screen.getByText(/saved title, brief, shape, and quality intact/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Return to final confirmation" })).toHaveAttribute(
      "href",
      "/studio/new?resume=checkout",
    );
  });

  it("answers a durable credit pause automatically once the required balance settles", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ resumed: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PurchaseReturnStatus
        purchaseConfirmed
        continueTo={"/projects/11111111-1111-4111-8111-111111111111/write" as Route}
        resumeRunId="22222222-2222-4222-8222-222222222222"
        resumeReady
        balance={6}
        requiredCredits={4}
      />,
    );

    expect(screen.getByText(/answered automatically/i)).toBeVisible();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/runs/22222222-2222-4222-8222-222222222222/input",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/projects/11111111-1111-4111-8111-111111111111/write"),
    );
  });

  it("waits for an existing buyer's new credit pack before answering the pause", () => {
    render(
      <PurchaseReturnStatus
        purchaseConfirmed
        continueTo={"/projects/11111111-1111-4111-8111-111111111111/write" as Route}
        resumeRunId="22222222-2222-4222-8222-222222222222"
        resumeReady={false}
        balance={1}
        requiredCredits={4}
      />,
    );

    expect(screen.getByText(/needs 4.00 credits and currently has 1.00/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /add enough credits/i })).toHaveAttribute(
      "href",
      "#packs-heading",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not treat an existing full-book unlock as settlement for this purchase", () => {
    render(<PurchaseReturnStatus purchaseConfirmed={false} continueTo="/studio/new" />);

    expect(screen.getByRole("heading", { name: "Confirming purchase." })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /continue to full-length setup/i }),
    ).not.toBeInTheDocument();
  });

  it("returns safely without posting input when the pause no longer needs a response", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PurchaseReturnStatus
        purchaseConfirmed
        continueTo={"/projects/11111111-1111-4111-8111-111111111111/write" as Route}
        resumeRunId="22222222-2222-4222-8222-222222222222"
        resumeNoLongerNeeded
      />,
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/projects/11111111-1111-4111-8111-111111111111/write"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

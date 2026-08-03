// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/studio" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

import { ProductShell } from "./product-shell";
import { StudioHelpProjectGenre } from "@/components/studio/studio-help-context";

beforeEach(() => {
  navigation.pathname = "/studio";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProductShell credit label", () => {
  it("shows the product entitlement instead of the private trial allowance", () => {
    render(
      <ProductShell creditLabel="Included story">
        <StudioHelpProjectGenre genre="mystery" />
        <p>Library content</p>
      </ProductShell>,
    );

    expect(
      screen.getByRole("complementary", { name: "Studio navigation and account" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Included story").length).toBeGreaterThan(0);
    expect(screen.queryByText(/10\.0 cr/i)).not.toBeInTheDocument();
  });

  it("shows the real wallet balance after full-book access is unlocked", () => {
    render(
      <ProductShell credits={14.25}>
        <p>Library content</p>
      </ProductShell>,
    );

    expect(screen.getAllByText("14.3 cr").length).toBeGreaterThan(0);
  });

  it("proactively explains suspended access without replacing the page heading", () => {
    render(
      <ProductShell suspended>
        <h1>My library</h1>
      </ProductShell>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "My library" })).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Account access is limited")).toBeVisible();
    expect(screen.getByText(/AI authoring and purchases are unavailable/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute(
      "href",
      "mailto:support@sopher.ai?subject=Suspended%20account%20help",
    );
  });

  it("keeps accessible Help available from the Studio shell", async () => {
    navigation.pathname = "/projects/project-1/write";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        return {
          ok: true,
          json: async () =>
            url.includes("/journey")
              ? { journey: { project: { genre: "mystery" } } }
              : url.includes("preferences=1")
                ? { version: 1, dismissed: false, seenCoachmarks: [] }
                : {
                    version: 1,
                    dismissed: false,
                    seenCoachmarks: [],
                    completedCount: 0,
                    steps: [],
                  },
        };
      }),
    );

    render(
      <ProductShell creditLabel="Included story">
        <p>Library content</p>
      </ProductShell>,
    );

    const helpButton = screen.getAllByRole("button", { name: /help/i })[0];
    expect(helpButton).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(helpButton!);
    expect(await screen.findByRole("heading", { name: "Help with this page" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Mystery craft guide" })).toHaveAttribute(
      "href",
      "/genres/mystery",
    );
  });
});

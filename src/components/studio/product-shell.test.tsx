// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/studio",
  useRouter: () => ({ push: vi.fn() }),
}));

import { ProductShell } from "./product-shell";

afterEach(cleanup);

describe("ProductShell credit label", () => {
  it("shows the product entitlement instead of the private trial allowance", () => {
    render(
      <ProductShell creditLabel="Included story">
        <p>Library content</p>
      </ProductShell>,
    );

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
});

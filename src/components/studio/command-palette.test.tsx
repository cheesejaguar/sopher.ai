// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthoringNextAction } from "@/lib/authoring-journey";

const navigation = vi.hoisted(() => ({
  pathname: "/projects/11111111-1111-4111-8111-111111111111/write",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

// cmdk measures and scrolls its list; jsdom implements neither.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

import { CommandPalette } from "@/components/studio/command-palette";

const CANCELLATION_ACTION: AuthoringNextAction = {
  kind: "finish_cancellation",
  href: "/projects/11111111-1111-4111-8111-111111111111/write",
  label: "View the safe stop",
  description: "The Studio is stopping at a safe production boundary.",
  requiresMeteredAccess: false,
};

afterEach(() => {
  cleanup();
  navigation.pathname = "/projects/11111111-1111-4111-8111-111111111111/write";
  navigation.push.mockReset();
});

describe("CommandPalette next step", () => {
  it("shows same-route cancellation as a passive status", () => {
    render(<CommandPalette open onOpenChange={vi.fn()} nextAction={CANCELLATION_ACTION} />);

    expect(screen.getByRole("option", { name: "Status: Stopping safely" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.queryByRole("option", { name: "Next: View the safe stop" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "Status: Stopping safely" }));
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("keeps cancellation navigable from a different project surface", () => {
    navigation.pathname = "/projects/11111111-1111-4111-8111-111111111111/editor";

    render(<CommandPalette open onOpenChange={vi.fn()} nextAction={CANCELLATION_ACTION} />);

    fireEvent.click(screen.getByRole("option", { name: "Next: View the safe stop" }));
    expect(navigation.push).toHaveBeenCalledWith(CANCELLATION_ACTION.href);
  });
});

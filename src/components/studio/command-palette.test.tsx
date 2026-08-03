// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ComponentProps, ReactNode } from "react";
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

vi.mock("@/components/ui/command", () => ({
  CommandDialog: ({ open, children }: { open?: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  CommandInput: (props: ComponentProps<"input">) => <input {...props} />,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ heading, children }: { heading: string; children: ReactNode }) => (
    <section aria-label={heading}>{children}</section>
  ),
  CommandItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
}));

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

    expect(screen.getByRole("button", { name: "Status: Stopping safely" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Next: View the safe stop" }),
    ).not.toBeInTheDocument();
  });

  it("keeps cancellation navigable from a different project surface", () => {
    navigation.pathname = "/projects/11111111-1111-4111-8111-111111111111/editor";

    render(<CommandPalette open onOpenChange={vi.fn()} nextAction={CANCELLATION_ACTION} />);

    fireEvent.click(screen.getByRole("button", { name: "Next: View the safe stop" }));
    expect(navigation.push).toHaveBeenCalledWith(CANCELLATION_ACTION.href);
  });
});

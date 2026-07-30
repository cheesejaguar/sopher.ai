// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserActions } from "./user-actions";

const mocks = vi.hoisted(() => ({
  adjustCredits: vi.fn(),
  refresh: vi.fn(),
  setSuspended: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/actions/admin", () => ({
  adminAdjustCredits: mocks.adjustCredits,
  adminSetSuspended: mocks.setSuspended,
}));

beforeEach(() => {
  mocks.adjustCredits.mockReset();
  mocks.refresh.mockReset();
  mocks.setSuspended.mockReset();
});

afterEach(cleanup);

describe("UserActions credit adjustment", () => {
  it("preserves entered values and focus after an async adjustment failure", async () => {
    mocks.adjustCredits.mockRejectedValue(new Error("network"));
    render(
      <UserActions userId="user-1" email="author@example.com" suspended={false} isSelf={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Adjust credits" }));
    const credits = await screen.findByRole("spinbutton", { name: "Credits" });
    const reason = screen.getByRole("textbox", { name: "Reason (recorded in the ledger)" });
    const apply = screen.getByRole("button", { name: "Apply" });
    fireEvent.change(credits, { target: { value: "25" } });
    fireEvent.change(reason, { target: { value: "Support correction" } });
    apply.focus();
    fireEvent.click(apply);

    expect(await screen.findByRole("alert")).toHaveTextContent("Adjustment failed");
    expect(credits).toHaveValue(25);
    expect(reason).toHaveValue("Support correction");
    expect(apply).toHaveFocus();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

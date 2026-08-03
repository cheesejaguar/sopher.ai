// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BaseUiFocusGuardLabels } from "./base-ui-focus-guard-labels";

describe("BaseUiFocusGuardLabels", () => {
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it("names a WebKit focus guard when Base UI assigns its button role", async () => {
    render(<BaseUiFocusGuardLabels />);
    const guard = document.createElement("span");
    guard.dataset.baseUiFocusGuard = "";
    document.body.append(guard);
    guard.setAttribute("role", "button");

    await waitFor(() => expect(guard.getAttribute("aria-label")).toBe("Focus boundary"));
  });

  it("does not override a guard name supplied by the primitive", async () => {
    render(<BaseUiFocusGuardLabels />);
    const guard = document.createElement("span");
    guard.dataset.baseUiFocusGuard = "";
    guard.setAttribute("role", "button");
    guard.setAttribute("aria-label", "Existing boundary name");
    document.body.append(guard);

    await waitFor(() => expect(guard.getAttribute("aria-label")).toBe("Existing boundary name"));
  });
});

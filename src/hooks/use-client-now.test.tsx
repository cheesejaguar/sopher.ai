import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useClientNow } from "./use-client-now";

// Hydration is driven through react-dom directly rather than Testing Library.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Clock() {
  const now = useClientNow();
  return <span>{now === null ? "measured on the server" : `client ${now}`}</span>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useClientNow", () => {
  it("hydrates server markup without a mismatch, then reads the browser clock", async () => {
    const html = renderToString(<Clock />);
    expect(html).toContain("measured on the server");

    // A different wall clock in the browser is exactly what used to mismatch.
    vi.useFakeTimers({ now: new Date("2026-10-06T12:00:00.000Z") });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Clock />, {
        onRecoverableError: (error) => {
          throw error;
        },
      });
    });

    expect(errors).not.toHaveBeenCalled();
    expect(container.textContent).toBe(`client ${Date.parse("2026-10-06T12:00:00.000Z")}`);

    // The shared interval advances every subscriber.
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(container.textContent).toBe(`client ${Date.parse("2026-10-06T12:00:30.000Z")}`);

    act(() => root?.unmount());
    container.remove();
  });
});

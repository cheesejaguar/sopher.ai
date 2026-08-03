// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReaderSessionBootstrap } from "./reader-session-bootstrap";

const TOKEN = "a".repeat(43);
const SHARE_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  window.history.replaceState(null, "", `/r/${SHARE_ID}#token=${TOKEN}`);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("ReaderSessionBootstrap", () => {
  it("scrubs the fragment and retries a transient exchange from memory", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("Missing", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReaderSessionBootstrap shareId={SHARE_ID} />);

    await screen.findByText("The reader could not connect");
    expect(window.location.hash).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      shareId: SHARE_ID,
      token: TOKEN,
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("This reader link is not available");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      shareId: SHARE_ID,
      token: TOKEN,
    });
  });

  it("treats an inactive link as terminal without offering a retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Missing", { status: 404 })));

    render(<ReaderSessionBootstrap shareId={SHARE_ID} />);

    await screen.findByText("This reader link is not available");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe(""));
  });

  it("scrubs a reopened fragment without exchanging or covering an already authorized edition", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(
      { nextInternalState: "preserved" },
      "",
      `/r/${SHARE_ID}#token=${TOKEN}`,
    );

    render(
      <>
        <p>Authorized manuscript</p>
        <ReaderSessionBootstrap shareId={SHARE_ID} hasValidSession />
      </>,
    );

    expect(screen.getByText("Authorized manuscript")).toBeVisible();
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.pathname).toBe(`/r/${SHARE_ID}`);
    expect(window.history.state).toEqual({ nextInternalState: "preserved" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    window.history.replaceState(window.history.state, "", `/r/${SHARE_ID}#token=${TOKEN}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

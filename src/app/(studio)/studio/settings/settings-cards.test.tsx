// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationPreferencesCard } from "./settings-cards";

const initialPreferences = {
  version: 1 as const,
  authoringActionRequired: true,
  authoringReminders: true,
  authoringCompleted: true,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NotificationPreferencesCard", () => {
  it("exposes three described optional switches and keeps essential mail explicit", () => {
    render(
      <NotificationPreferencesCard
        email="author@example.com"
        initialPreferences={initialPreferences}
      />,
    );

    for (const name of ["My book needs me", "Follow-up reminders", "My book is finished"]) {
      expect(screen.getByRole("switch", { name })).toBeChecked();
      expect(screen.getByRole("switch", { name })).toHaveAccessibleDescription();
    }
    expect(screen.getByText("author@example.com")).toBeVisible();
    expect(
      screen.getByText(/Purchase receipts and essential account or security messages/),
    ).toBeVisible();
    expect(
      screen.getByText(/books started after notification controls became available/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save email preferences" })).toBeDisabled();
  });

  it("sends only changed fields and announces the authoritative saved result", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          preferences: {
            ...initialPreferences,
            authoringActionRequired: false,
            authoringCompleted: false,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(
      <NotificationPreferencesCard
        email="author@example.com"
        initialPreferences={initialPreferences}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "My book needs me" }));
    fireEvent.click(screen.getByRole("switch", { name: "My book is finished" }));
    fireEvent.click(screen.getByRole("button", { name: "Save email preferences" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authoringActionRequired: false,
          authoringCompleted: false,
        }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Email preferences saved.");
    expect(screen.getByRole("button", { name: "Save email preferences" })).toBeDisabled();
  });

  it("keeps the intended controls and reports an unconfirmed server response truthfully", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    render(
      <NotificationPreferencesCard
        email="author@example.com"
        initialPreferences={initialPreferences}
      />,
    );

    const reminder = screen.getByRole("switch", { name: "Follow-up reminders" });
    fireEvent.click(reminder);
    expect(reminder).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save email preferences" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "couldn't confirm whether those preferences were saved",
    );
    expect(reminder).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save email preferences" })).toBeEnabled();
  });

  it("treats response loss as unconfirmed and lets the author retry", async () => {
    const fetchMock = vi.mocked(fetch).mockRejectedValue(new TypeError("Network connection lost"));
    render(
      <NotificationPreferencesCard
        email="author@example.com"
        initialPreferences={initialPreferences}
      />,
    );

    const completed = screen.getByRole("switch", { name: "My book is finished" });
    fireEvent.click(completed);
    fireEvent.click(screen.getByRole("button", { name: "Save email preferences" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("reload to check");
    expect(completed).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save email preferences" })).toBeEnabled();

    // The server may have committed `false` before the response was lost. If
    // the author changes their mind, the original baseline is no longer safe:
    // keep Save enabled and send every current value to make the result certain.
    fireEvent.click(completed);
    expect(completed).toBeChecked();
    expect(screen.getByRole("button", { name: "Save email preferences" })).toBeEnabled();

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ preferences: initialPreferences }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save email preferences" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      authoringActionRequired: true,
      authoringReminders: true,
      authoringCompleted: true,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Email preferences saved.");
    expect(screen.getByRole("button", { name: "Save email preferences" })).toBeDisabled();
  });
});

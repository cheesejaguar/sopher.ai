import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getNotificationSettings: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/notification-preferences", () => ({
  getNotificationSettings: mocks.getNotificationSettings,
  updateNotificationPreferences: mocks.updateNotificationPreferences,
}));

import { GET, PATCH } from "./route";

const preferences = {
  version: 1 as const,
  authoringActionRequired: true,
  authoringReminders: true,
  authoringCompleted: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  mocks.getNotificationSettings.mockResolvedValue({
    email: "author@example.com",
    preferences,
  });
  mocks.updateNotificationPreferences.mockResolvedValue({
    ...preferences,
    authoringReminders: false,
  });
});

describe("notification preference route", () => {
  it("returns only the signed-in account's settings without cacheable email data", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getNotificationSettings).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      email: "author@example.com",
      preferences,
    });
  });

  it("updates only supplied preferences under the authenticated user id", async () => {
    const response = await PATCH(
      new Request("https://sopher.ai/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authoringReminders: false }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith("user-1", {
      authoringReminders: false,
    });
    await expect(response.json()).resolves.toEqual({
      preferences: { ...preferences, authoringReminders: false },
    });
  });

  it.each([
    ["an empty update", {}],
    ["an unknown preference", { marketing: false }],
    ["a caller-supplied user id", { userId: "user-2", authoringCompleted: false }],
    ["a non-boolean value", { authoringCompleted: "no" }],
  ])("rejects %s", async (_label, body) => {
    const response = await PATCH(
      new Request("https://sopher.ai/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateNotificationPreferences).not.toHaveBeenCalled();
  });
});

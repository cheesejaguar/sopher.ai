import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});

import {
  maySendAuthoringNotification,
  notificationPreferencesFromRow,
} from "@/lib/notification-preferences";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notification preference normalization", () => {
  it("defaults legacy or absent rows to the established enabled behavior", () => {
    expect(notificationPreferencesFromRow()).toEqual({
      version: 1,
      authoringActionRequired: true,
      authoringReminders: true,
      authoringCompleted: true,
    });
  });

  it("preserves explicit false values", () => {
    expect(
      notificationPreferencesFromRow({
        authoringActionRequired: false,
        authoringReminders: false,
        authoringCompleted: false,
      }),
    ).toEqual({
      version: 1,
      authoringActionRequired: false,
      authoringReminders: false,
      authoringCompleted: false,
    });
  });

  it("fails optional delivery closed when the latest account preference cannot be read", async () => {
    mocks.getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockRejectedValue(new Error("database unavailable")),
          })),
        })),
      })),
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(maySendAuthoringNotification("user-1", "authoringActionRequired")).resolves.toBe(
      false,
    );
    expect(warning).toHaveBeenCalledWith(
      "[email] notification preference could not be resolved",
      expect.objectContaining({ category: "authoringActionRequired" }),
    );
    warning.mockRestore();
  });
});

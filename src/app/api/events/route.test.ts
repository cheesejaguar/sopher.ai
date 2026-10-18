import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  requireUser: vi.fn(),
  values: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/security/rate-limit", () => ({
  LIMITS: { events: "events" },
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/analytics/events", () => ({
  isEventName: (name: unknown) => name === "page_view",
  sanitizeProps: (props: unknown) => props ?? {},
}));
vi.mock("@/db", () => ({
  schema: { analyticsEvents: {} },
  getDb: () => ({ insert: () => ({ values: mocks.values }) }),
}));

import { POST } from "./route";

function event(body: BodyInit): Request {
  return new Request("https://sopher.ai/api/events", { method: "POST", body });
}

beforeEach(() => {
  mocks.rateLimit.mockReset().mockResolvedValue({ limited: false });
  mocks.requireUser.mockReset().mockRejectedValue(new Error("Not signed in"));
  mocks.values.mockReset().mockResolvedValue(undefined);
});

describe("analytics ingest", () => {
  it("records a known event for a signed-out visitor", async () => {
    const response = await POST(event(JSON.stringify({ name: "page_view", props: { a: 1 } })));
    expect(response.status).toBe(204);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ name: "page_view", userId: null }),
    );
  });

  it("is IP-rate-limited before anything is written", async () => {
    mocks.rateLimit.mockResolvedValue({
      limited: true,
      response: new Response(null, { status: 429 }),
    });
    const response = await POST(event(JSON.stringify({ name: "page_view" })));
    expect(response.status).toBe(204);
    expect(mocks.rateLimit).toHaveBeenCalledWith("events", expect.any(Request), undefined);
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("drops an oversized body without parsing or writing it", async () => {
    const padding = "x".repeat(32 * 1024);
    const response = await POST(event(JSON.stringify({ name: "page_view", props: { padding } })));
    expect(response.status).toBe(204);
    expect(mocks.values).not.toHaveBeenCalled();
  });
});

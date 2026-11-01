import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  requireUser: vi.fn(),
  values: vi.fn(),
  anonCookie: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "sopher_aid" && mocks.anonCookie !== undefined
        ? { value: mocks.anonCookie }
        : undefined,
  }),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/security/rate-limit", () => ({
  LIMITS: { events: "events" },
  rateLimit: mocks.rateLimit,
}));
// The event-name allowlist and prop sanitizer are the route's whole content
// policy, so they stay real; only the database write is stubbed.
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
  mocks.anonCookie = undefined;
});

describe("analytics ingest", () => {
  it("records a known event for a signed-out visitor", async () => {
    const response = await POST(event(JSON.stringify({ name: "wizard_step", props: { step: 2 } })));
    expect(response.status).toBe(204);
    expect(mocks.values).toHaveBeenCalledOnce();
    expect(mocks.values).toHaveBeenCalledWith({
      name: "wizard_step",
      userId: null,
      anonId: null,
      props: { step: 2 },
    });
  });

  it("attributes the event to the signed-in user and the capped anonymous id", async () => {
    mocks.requireUser.mockResolvedValue({ userId: "user-1" });
    mocks.anonCookie = "a".repeat(100);
    await POST(event(JSON.stringify({ name: "help_opened" })));
    expect(mocks.values).toHaveBeenCalledWith({
      name: "help_opened",
      userId: "user-1",
      anonId: "a".repeat(64),
      props: {},
    });
  });

  it("drops an event name outside the closed analytics contract", async () => {
    const response = await POST(event(JSON.stringify({ name: "page_view", props: { a: 1 } })));
    expect(response.status).toBe(204);
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("sanitizes props to capped scalars before writing them", async () => {
    await POST(
      event(
        JSON.stringify({
          name: "export_downloaded",
          props: {
            format: "epub",
            pages: 312,
            final: true,
            nested: { a: 1 },
            list: [1, 2],
            long: "x".repeat(500),
            readerLink: `https://sopher.ai/r/${"A".repeat(43)}`,
          },
        }),
      ),
    );
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        props: { format: "epub", pages: 312, final: true, long: "x".repeat(200) },
      }),
    );
  });

  it("drops a body that is not JSON without writing", async () => {
    const response = await POST(event("not json"));
    expect(response.status).toBe(204);
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("still answers 204 when the insert fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.values.mockRejectedValue(new Error("db down"));
    const response = await POST(event(JSON.stringify({ name: "wizard_step" })));
    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledWith("[events] insert failed:", expect.any(Error));
    warn.mockRestore();
  });

  it("is IP-rate-limited before anything is written", async () => {
    mocks.rateLimit.mockResolvedValue({
      limited: true,
      response: new Response(null, { status: 429 }),
    });
    const response = await POST(event(JSON.stringify({ name: "wizard_step" })));
    expect(response.status).toBe(204);
    expect(mocks.rateLimit).toHaveBeenCalledWith("events", expect.any(Request), undefined);
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("drops an oversized body without parsing or writing it", async () => {
    const padding = "x".repeat(32 * 1024);
    const response = await POST(event(JSON.stringify({ name: "wizard_step", props: { padding } })));
    expect(response.status).toBe(204);
    expect(mocks.values).not.toHaveBeenCalled();
  });
});

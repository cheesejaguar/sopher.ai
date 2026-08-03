import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadReaderEdition: vi.fn() }));

vi.mock("@/lib/publication-editions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/publication-editions")>();
  return { ...original, loadReaderEdition: mocks.loadReaderEdition };
});

import { POST } from "./route";

const token = "uXFb2jtK_sno-TzLiofyD7TqBYZ3p3YP5eI6jgoyjZs";
const shareId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.loadReaderEdition.mockReset();
});

describe("reader session exchange", () => {
  it("exchanges a valid fragment secret for a scoped HttpOnly session", async () => {
    mocks.loadReaderEdition.mockResolvedValue({ shareId, snapshot: {} });
    const response = await POST(
      new Request("https://sopher.ai/api/reader-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId, token }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.loadReaderEdition).toHaveBeenCalledWith(token);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`sopher_reader_${shareId.replaceAll("-", "")}=${token}`);
    expect(cookie).toContain(`Path=/r/${shareId}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
  });

  it("rejects malformed or inactive secrets and clears an old session", async () => {
    mocks.loadReaderEdition.mockResolvedValue(null);
    const response = await POST(
      new Request("https://sopher.ai/api/reader-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId, token }),
      }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toMatch(
      new RegExp(
        `sopher_reader_${shareId.replaceAll("-", "")}=;.*Path=/r/${shareId};.*(?:Max-Age=0|Expires=)`,
        "i",
      ),
    );

    const malformed = await POST(
      new Request("https://sopher.ai/api/reader-session", {
        method: "POST",
        body: JSON.stringify({ shareId, token: "guessable" }),
      }),
    );
    expect(malformed.status).toBe(404);
  });

  it("does not exchange a valid token for a different share path", async () => {
    mocks.loadReaderEdition.mockResolvedValue({ shareId, snapshot: {} });
    const response = await POST(
      new Request("https://sopher.ai/api/reader-session", {
        method: "POST",
        body: JSON.stringify({
          shareId: "22222222-2222-4222-8222-222222222222",
          token,
        }),
      }),
    );
    expect(response.status).toBe(404);
  });

  it("isolates simultaneous reader sessions by share id and cookie path", async () => {
    const otherToken = "b".repeat(43);
    const otherShareId = "22222222-2222-4222-8222-222222222222";
    mocks.loadReaderEdition.mockImplementation(async (candidate: string) => ({
      shareId: candidate === token ? shareId : otherShareId,
      snapshot: {},
    }));

    const [first, second] = await Promise.all([
      POST(
        new Request("https://sopher.ai/api/reader-session", {
          method: "POST",
          body: JSON.stringify({ shareId, token }),
        }),
      ),
      POST(
        new Request("https://sopher.ai/api/reader-session", {
          method: "POST",
          body: JSON.stringify({ shareId: otherShareId, token: otherToken }),
        }),
      ),
    ]);

    const firstCookie = first.headers.get("set-cookie") ?? "";
    const secondCookie = second.headers.get("set-cookie") ?? "";
    expect(firstCookie).toContain(`Path=/r/${shareId}`);
    expect(secondCookie).toContain(`Path=/r/${otherShareId}`);
    expect(firstCookie.split("=", 1)[0]).not.toBe(secondCookie.split("=", 1)[0]);
  });
});

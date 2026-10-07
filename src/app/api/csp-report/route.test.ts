import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rateLimit: vi.fn() }));

vi.mock("@/lib/security/rate-limit", () => ({
  LIMITS: { cspReport: "csp-report" },
  rateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

function report(body: BodyInit, headers?: HeadersInit): Request {
  return new Request("https://sopher.ai/api/csp-report", { method: "POST", body, headers });
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.rateLimit.mockReset().mockResolvedValue({ limited: false });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("CSP report collector", () => {
  it("logs a legacy report-uri violation without its query string", async () => {
    const response = await POST(
      report(
        JSON.stringify({
          "csp-report": {
            "document-uri": "https://sopher.ai/studio?secret=1",
            "effective-directive": "script-src-elem",
            "blocked-uri": "https://evil.example/x.js?token=abc",
            disposition: "report",
          },
        }),
      ),
    );
    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledWith("[csp]", {
      directive: "script-src-elem",
      blocked: "https://evil.example/x.js",
      document: "https://sopher.ai/studio",
      disposition: "report",
    });
  });

  it("logs Reporting API batches", async () => {
    await POST(
      report(
        JSON.stringify([
          {
            type: "csp-violation",
            body: {
              effectiveDirective: "img-src",
              blockedURL: "https://tracker.example/p.gif",
              documentURL: "https://sopher.ai/",
              disposition: "report",
            },
          },
          { type: "deprecation", body: {} },
        ]),
      ),
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("drops oversized bodies before parsing them", async () => {
    const response = await POST(report("x".repeat(64 * 1024)));
    expect(response.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it("drops rate-limited callers silently", async () => {
    mocks.rateLimit.mockResolvedValue({
      limited: true,
      response: new Response(null, { status: 429 }),
    });
    const response = await POST(report(JSON.stringify({ "csp-report": {} })));
    expect(response.status).toBe(204);
    expect(mocks.rateLimit).toHaveBeenCalledWith("csp-report", expect.any(Request), undefined);
    expect(warn).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { browserHasAnalyticsConsent, hasAnalyticsConsent } from "./consent";

afterEach(() => vi.unstubAllGlobals());
describe("analytics consent", () => {
  it("fails closed for missing, rejected, or malformed preferences", () => {
    for (const value of [undefined, "", "rejected", "true", "Accepted"]) {
      expect(hasAnalyticsConsent(value)).toBe(false);
    }
    expect(hasAnalyticsConsent("accepted")).toBe(true);
  });
  it("does not enable tracking during server rendering", () => {
    expect(browserHasAnalyticsConsent()).toBe(false);
  });
  it("requires the exact first-party preference rather than a similarly named cookie", () => {
    for (const cookie of [
      "",
      "sopher_analytics_consent=rejected",
      "other_sopher_analytics_consent=accepted",
    ]) {
      vi.stubGlobal("document", { cookie });
      expect(browserHasAnalyticsConsent()).toBe(false);
    }
    vi.stubGlobal("document", { cookie: "theme=dark; sopher_analytics_consent=accepted" });
    expect(browserHasAnalyticsConsent()).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { isEventName, sanitizeProps, MAX_PROPS_KEYS, MAX_PROP_LENGTH } from "./events";
import { isEmptyAttribution, parseAttributionCookie, readAttribution } from "./attribution";

describe("event names", () => {
  it("accepts the known events and nothing else", () => {
    expect(isEventName("purchase")).toBe(true);
    expect(isEventName("wizard_step")).toBe(true);
    // The failure mode this guards against is not an error — it is
    // bookStarted and book-started quietly coexisting in the warehouse.
    expect(isEventName("bookStarted")).toBe(false);
    expect(isEventName("")).toBe(false);
    expect(isEventName(null)).toBe(false);
    expect(isEventName(42)).toBe(false);
  });
});

describe("sanitizeProps", () => {
  it("keeps scalars", () => {
    expect(sanitizeProps({ genre: "fantasy", chapters: 12, approved: true })).toEqual({
      genre: "fantasy",
      chapters: 12,
      approved: true,
    });
  });

  it("drops anything that is not a scalar", () => {
    expect(sanitizeProps({ nested: { a: 1 }, list: [1, 2], fn: "ok", nope: null })).toEqual({
      fn: "ok",
    });
  });

  it("caps key count and value length — this is an authenticated but untrusted write", () => {
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitizeProps(many))).toHaveLength(MAX_PROPS_KEYS);

    const long = sanitizeProps({ brief: "x".repeat(5_000) });
    expect((long.brief as string).length).toBe(MAX_PROP_LENGTH);
  });

  it("rejects non-objects rather than throwing", () => {
    expect(sanitizeProps(null)).toEqual({});
    expect(sanitizeProps("string")).toEqual({});
    expect(sanitizeProps([1, 2, 3])).toEqual({});
  });

  it("drops absurd key names", () => {
    expect(sanitizeProps({ ["k".repeat(100)]: 1, ok: 2 })).toEqual({ ok: 2 });
  });

  it("drops non-finite numbers, which break SQL aggregates", () => {
    expect(sanitizeProps({ a: NaN, b: Infinity, c: 3 })).toEqual({ c: 3 });
  });
});

describe("readAttribution", () => {
  it("captures utm parameters and the landing path", () => {
    const url = new URL(
      "https://sopher.ai/pricing?utm_source=reddit&utm_medium=social&utm_campaign=launch",
    );
    const a = readAttribution(url, null);
    expect(a.source).toBe("reddit");
    expect(a.medium).toBe("social");
    expect(a.campaign).toBe("launch");
    expect(a.landingPath).toBe("/pricing");
    expect(a.capturedAt).toBeTruthy();
  });

  it("keeps only the referrer host — a full referrer can carry someone else's query", () => {
    const a = readAttribution(
      new URL("https://sopher.ai/"),
      "https://news.ycombinator.com/item?id=123&email=someone@example.com",
    );
    expect(a.referrerHost).toBe("news.ycombinator.com");
    expect(JSON.stringify(a)).not.toContain("example.com");
  });

  it("ignores same-site referrers, which are navigation and not acquisition", () => {
    const a = readAttribution(new URL("https://sopher.ai/pricing"), "https://sopher.ai/");
    expect(a.referrerHost).toBeUndefined();
  });

  it("survives a malformed referrer", () => {
    expect(
      readAttribution(new URL("https://sopher.ai/"), "not a url").referrerHost,
    ).toBeUndefined();
  });

  it("treats a bare direct visit as empty, so a later campaign can be first touch", () => {
    expect(isEmptyAttribution(readAttribution(new URL("https://sopher.ai/"), null))).toBe(true);
    expect(
      isEmptyAttribution(readAttribution(new URL("https://sopher.ai/?utm_source=x"), null)),
    ).toBe(false);
  });
});

describe("parseAttributionCookie", () => {
  it("round-trips a cookie written by the proxy", () => {
    const original = readAttribution(new URL("https://sopher.ai/?utm_source=reddit"), null);
    const cookie = encodeURIComponent(JSON.stringify(original));
    expect(parseAttributionCookie(cookie)).toEqual(original);
  });

  it("returns null on anything malformed rather than throwing into signup", () => {
    expect(parseAttributionCookie(undefined)).toBeNull();
    expect(parseAttributionCookie("not-json")).toBeNull();
    expect(parseAttributionCookie(encodeURIComponent('{"no":"capturedAt"}'))).toBeNull();
    expect(parseAttributionCookie(encodeURIComponent('"a string"'))).toBeNull();
  });
});

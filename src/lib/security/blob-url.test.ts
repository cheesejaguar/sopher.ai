import { describe, expect, it } from "vitest";

import { isOwnedBlobUrl, ownedBlobHostname, ownedImageUrlFilter } from "./blob-url";

const TOKEN_ENV = { BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_AbC123xyz_secretpart" };

describe("ownedBlobHostname", () => {
  it("derives the public store host from the read-write token", () => {
    expect(ownedBlobHostname(TOKEN_ENV)).toBe("abc123xyz.public.blob.vercel-storage.com");
  });

  it("accepts an OIDC store id with or without its prefix", () => {
    expect(ownedBlobHostname({ BLOB_STORE_ID: "store_Q9w" })).toBe(
      "q9w.public.blob.vercel-storage.com",
    );
    expect(ownedBlobHostname({ BLOB_STORE_ID: "Q9w" })).toBe("q9w.public.blob.vercel-storage.com");
  });

  it("returns null when the store cannot be identified", () => {
    expect(ownedBlobHostname({})).toBeNull();
    expect(ownedBlobHostname({ BLOB_READ_WRITE_TOKEN: "not-a-token" })).toBeNull();
  });
});

describe("isOwnedBlobUrl", () => {
  it("accepts only this deployment's store when it is known", () => {
    expect(
      isOwnedBlobUrl("https://abc123xyz.public.blob.vercel-storage.com/a.png", TOKEN_ENV),
    ).toBe(true);
    expect(isOwnedBlobUrl("https://attacker.public.blob.vercel-storage.com/a.png", TOKEN_ENV)).toBe(
      false,
    );
  });

  it("falls back to any public Blob host, never an arbitrary origin", () => {
    expect(isOwnedBlobUrl("https://any.public.blob.vercel-storage.com/a.png", {})).toBe(true);
    expect(isOwnedBlobUrl("https://example.com/a.png", {})).toBe(false);
    expect(isOwnedBlobUrl("http://any.public.blob.vercel-storage.com/a.png", {})).toBe(false);
    expect(isOwnedBlobUrl("https://public.blob.vercel-storage.com.evil.com/a.png", {})).toBe(false);
    expect(isOwnedBlobUrl("https://u:p@any.public.blob.vercel-storage.com/a.png", {})).toBe(false);
    expect(isOwnedBlobUrl("not a url", {})).toBe(false);
    expect(isOwnedBlobUrl(null, {})).toBe(false);
  });
});

describe("ownedImageUrlFilter", () => {
  const owned = "https://any.public.blob.vercel-storage.com/a.png";

  it("requires membership in the project's asset list when one is given", () => {
    expect(ownedImageUrlFilter([owned])(owned)).toBe(owned);
    expect(ownedImageUrlFilter([])(owned)).toBeNull();
    expect(ownedImageUrlFilter(["https://example.com/a.png"])("https://example.com/a.png")).toBe(
      null,
    );
  });
});

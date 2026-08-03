import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  loadReaderEdition: vi.fn(),
  publicationAssetUrls: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));
vi.mock("@/lib/publication-editions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/publication-editions")>();
  return {
    ...original,
    loadReaderEdition: mocks.loadReaderEdition,
    publicationAssetUrls: mocks.publicationAssetUrls,
  };
});

import { GET } from "./route";

const SHARE_A = "11111111-1111-4111-8111-111111111111";
const SHARE_B = "22222222-2222-4222-8222-222222222222";
const ASSET_KEY = "a".repeat(64);
const TOKEN = "t".repeat(43);

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.cookieGet.mockReset().mockReturnValue({ value: TOKEN });
  mocks.loadReaderEdition.mockReset().mockResolvedValue({ shareId: SHARE_A, snapshot: {} });
  mocks.publicationAssetUrls.mockReset();
});

describe("reader edition assets", () => {
  it("never serves one edition's asset through another share path", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request(`https://sopher.ai/r/${SHARE_B}/assets/${ASSET_KEY}`), {
      params: Promise.resolve({ shareId: SHARE_B, assetKey: ASSET_KEY }),
    });

    expect(response.status).toBe(404);
    expect(mocks.publicationAssetUrls).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams only an asset authorized by the matching immutable edition", async () => {
    const url = "https://reader-test.public.blob.vercel-storage.com/cover.png";
    mocks.publicationAssetUrls.mockReturnValue(new Map([[ASSET_KEY, url]]));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "image/png", "Content-Length": "3" },
        }),
      ),
    );

    const response = await GET(new Request(`https://sopher.ai/r/${SHARE_A}/assets/${ASSET_KEY}`), {
      params: Promise.resolve({ shareId: SHARE_A, assetKey: ASSET_KEY }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});

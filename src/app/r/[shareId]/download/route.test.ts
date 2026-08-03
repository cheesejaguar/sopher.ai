import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  loadReaderEdition: vi.fn(),
  manuscriptToMarkdown: vi.fn(),
  publicationMatter: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));
vi.mock("@/lib/export/assemble", () => ({ manuscriptToMarkdown: mocks.manuscriptToMarkdown }));
vi.mock("@/lib/publication-editions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/publication-editions")>();
  return {
    ...original,
    loadReaderEdition: mocks.loadReaderEdition,
    publicationMatter: mocks.publicationMatter,
  };
});

import { GET } from "./route";

const SHARE_A = "11111111-1111-4111-8111-111111111111";
const SHARE_B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieGet.mockReturnValue({ value: "t".repeat(43) });
  mocks.loadReaderEdition.mockResolvedValue({
    shareId: SHARE_A,
    allowDownload: true,
    snapshot: {
      title: "Edition A",
      author: "Ada Vale",
      synopsis: null,
      genre: "fantasy",
      chapters: [{ number: 1, title: "Arrival", markdown: "Prose", wordCount: 1 }],
      figures: {},
      coverUrl: null,
      editionNote: "a reading copy",
    },
  });
  mocks.publicationMatter.mockReturnValue({});
  mocks.manuscriptToMarkdown.mockReturnValue("# Edition A\n");
});

describe("reader edition downloads", () => {
  it("never downloads one edition through another share path", async () => {
    const response = await GET(new Request(`https://sopher.ai/r/${SHARE_B}/download`), {
      params: Promise.resolve({ shareId: SHARE_B }),
    });
    expect(response.status).toBe(404);
    expect(mocks.manuscriptToMarkdown).not.toHaveBeenCalled();
  });

  it("downloads the immutable edition bound to the matching path", async () => {
    const response = await GET(new Request(`https://sopher.ai/r/${SHARE_A}/download`), {
      params: Promise.resolve({ shareId: SHARE_A }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("edition-a.md");
    expect(await response.text()).toBe("# Edition A\n");
  });
});

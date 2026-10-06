import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ epub: vi.fn() }));

// epub-gen-memory fetches every <img src> itself; the assertion is about what
// reaches it, so the generator is replaced and its arguments inspected.
vi.mock("epub-gen-memory", () => ({ default: mocks.epub }));

import { buildManuscript } from "./assemble";
import { exportEpub } from "./epub";

const OWNED = "https://assets.public.blob.vercel-storage.com/illustrations/harbour.png";
const COVER = "https://assets.public.blob.vercel-storage.com/covers/cover.png";
const FOREIGN_BLOB = "https://other.public.blob.vercel-storage.com/x.png";

function manuscript(assetUrls?: string[]) {
  return buildManuscript({
    title: "The Salt Road",
    matter: { coverUrl: COVER },
    chapters: [
      {
        number: 1,
        title: "Low Tide",
        content: [
          "![metadata probe](http://169.254.169.254/latest/meta-data/)",
          "",
          "![an internal service](https://internal.example/admin.png)",
          "",
          "![someone else's store](" + FOREIGN_BLOB + ")",
          "",
          "![the harbour at dawn](" + OWNED + ")",
        ].join("\n"),
      },
    ],
    assetUrls,
  });
}

function renderedContent(): string {
  const [, content] = mocks.epub.mock.calls[0] as [unknown, Array<{ content: string }>];
  return content.map((chapter) => chapter.content).join("\n");
}

describe("exportEpub image allowlist", () => {
  beforeEach(() => {
    mocks.epub.mockReset();
    mocks.epub.mockResolvedValue(Buffer.from("epub"));
  });

  it("never hands an external image URL to the fetching EPUB generator", async () => {
    await exportEpub(manuscript([OWNED, COVER]));

    const html = renderedContent();
    expect(html).not.toContain("169.254.169.254");
    expect(html).not.toContain("internal.example");
    expect(html).not.toContain(FOREIGN_BLOB);
    // The words survive even though the request does not.
    expect(html).toContain("metadata probe");
    expect(html).toContain("an internal service");
    expect(html).toContain(`<img src="${OWNED}"`);

    const [options] = mocks.epub.mock.calls[0] as [{ cover?: string; fetchTimeout?: number }];
    expect(options.cover).toBe(COVER);
    expect(options.fetchTimeout).toBeGreaterThan(0);
  });

  it("drops a Blob image that is not one of the project's own assets", async () => {
    await exportEpub(manuscript([COVER]));

    const html = renderedContent();
    expect(html).not.toContain(`<img src="${OWNED}"`);
    expect(html).toContain("the harbour at dawn");
  });

  it("drops a cover outside the project's assets", async () => {
    await exportEpub(manuscript([OWNED]));

    const [options] = mocks.epub.mock.calls[0] as [{ cover?: string }];
    expect(options.cover).toBeUndefined();
  });

  it("falls back to the owned-store check for snapshots without an asset list", async () => {
    await exportEpub(manuscript(undefined));

    const html = renderedContent();
    expect(html).not.toContain("169.254.169.254");
    expect(html).not.toContain("internal.example");
    expect(html).toContain(`<img src="${OWNED}"`);
  });
});

import { describe, expect, it } from "vitest";

import { buildManuscript, type ExportSnapshot } from "@/lib/export/assemble";
import {
  publicationEditionSnapshotSchema,
  publicationAssetUrls,
  publicationSnapshot,
  publicationSourceDigest,
  readerTokenForRequest,
  readerShareTokenSchema,
} from "./publication-editions";

const PROJECT_ASSETS = new Set([
  "https://assets.public.blob.vercel-storage.com/cover.png",
  "https://assets.public.blob.vercel-storage.com/map.svg",
  "https://assets.public.blob.vercel-storage.com/map.png",
]);

function exportSnapshot(capturedAt = "2026-08-02T12:00:00.000Z"): ExportSnapshot {
  return {
    capturedAt,
    incomplete: false,
    chapterVersions: [{ number: 1, version: 4 }],
    manuscript: buildManuscript({
      title: "The Clockmaker's Map",
      synopsis: "A map that redraws the city every midnight.",
      genre: "Fantasy",
      matter: {
        subtitle: "A Midnight Cartography",
        author: "Ada Vale",
        dedication: "For the lost streets.",
        coverUrl: "https://assets.public.blob.vercel-storage.com/cover.png",
      },
      chapters: [{ number: 1, title: "The First Bell", content: "Midnight struck twice." }],
      figures: {
        digest: {
          svgUrl: "https://assets.public.blob.vercel-storage.com/map.svg",
          pngUrl: "https://assets.public.blob.vercel-storage.com/map.png",
          alt: "A map of the old city",
          pngBytes: new Uint8Array([1, 2, 3]),
        },
      },
    }),
  };
}

describe("publication editions", () => {
  it("accepts exactly one 256-bit base64url reader token", () => {
    expect(readerShareTokenSchema.safeParse("a".repeat(43)).success).toBe(true);
    expect(readerShareTokenSchema.safeParse("a".repeat(42)).success).toBe(false);
    expect(readerShareTokenSchema.safeParse(`${"a".repeat(42)}=`).success).toBe(false);
  });

  it("derives an unpredictable, replay-stable token on the server", () => {
    const input = {
      secret: "a dedicated deployment secret with enough entropy",
      userId: "user_123",
      projectId: "11111111-1111-4111-8111-111111111111",
      requestKey: "22222222-2222-4222-8222-222222222222",
    };
    const first = readerTokenForRequest(input);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(readerTokenForRequest(input)).toBe(first);
    expect(
      readerTokenForRequest({ ...input, requestKey: "33333333-3333-4333-8333-333333333333" }),
    ).not.toBe(first);
  });

  it("captures the complete reader edition without embedding exporter-only image bytes", () => {
    const snapshot = publicationSnapshot(exportSnapshot(), PROJECT_ASSETS);
    expect(publicationEditionSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.title).toBe("The Clockmaker's Map");
    expect(snapshot.matter.dedication).toBe("For the lost streets.");
    expect(snapshot.figures.digest).toEqual({
      svgUrl: "https://assets.public.blob.vercel-storage.com/map.svg",
      pngUrl: "https://assets.public.blob.vercel-storage.com/map.png",
      alt: "A map of the old city",
    });
    expect(snapshot.chapters[0]).toMatchObject({
      number: 1,
      title: "The First Bell",
      markdown: "Midnight struck twice.",
    });
  });

  it("keeps reader assets on the revocation-aware owned-asset proxy boundary", () => {
    const snapshot = publicationSnapshot(exportSnapshot(), PROJECT_ASSETS);
    const urls = [...publicationAssetUrls(snapshot).values()];
    expect(urls).toContain("https://assets.public.blob.vercel-storage.com/cover.png");
    expect(urls).toContain("https://assets.public.blob.vercel-storage.com/map.svg");

    const external = exportSnapshot();
    external.manuscript.coverUrl = "https://tracker.example/pixel.png";
    external.manuscript.figures.digest!.pngUrl = "javascript:alert(1)";
    external.manuscript.chapters[0].markdown +=
      "\n\n![Unowned](https://attacker.public.blob.vercel-storage.com/large.png)";
    const safe = publicationSnapshot(external, PROJECT_ASSETS);
    expect(safe.coverUrl).toBeNull();
    expect(safe.figures.digest?.pngUrl).toBeNull();
    expect([...publicationAssetUrls(safe).values()]).not.toContain(
      "https://attacker.public.blob.vercel-storage.com/large.png",
    );
  });

  it("reuses unchanged content even when it is captured at a different time", () => {
    const first = publicationSnapshot(exportSnapshot("2026-08-02T12:00:00.000Z"), PROJECT_ASSETS);
    const second = publicationSnapshot(exportSnapshot("2026-08-02T12:05:00.000Z"), PROJECT_ASSETS);
    expect(publicationSourceDigest(first)).toBe(publicationSourceDigest(second));

    second.chapters[0].markdown = "Midnight struck three times.";
    expect(publicationSourceDigest(first)).not.toBe(publicationSourceDigest(second));
  });
});

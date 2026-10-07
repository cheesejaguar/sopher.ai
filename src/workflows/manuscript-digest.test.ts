import { beforeEach, describe, expect, it, vi } from "vitest";

import { manuscriptDigest, type ManuscriptStateRow } from "@/lib/manuscript-state";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), selections: [] as unknown[] }));

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: mocks.getDb,
}));

import {
  currentManuscriptFromRows,
  digestScopeKey,
  loadCurrentManuscript,
  manuscriptDigestMatches,
  manuscriptDigestV2,
} from "./manuscript-digest";
import { contentDigest } from "./work-state";

const rows: ManuscriptStateRow[] = [
  {
    id: "chapter-2",
    chapterNumber: 2,
    title: "The Ledger",
    summary: "Mira finds the ledger short.",
    content: "Nine hulls, and not one of them hers.",
    status: "edited",
    wordCount: 8,
  },
  {
    id: "chapter-1",
    chapterNumber: 1,
    title: "The Harbor",
    summary: "Mira reaches the harbor.",
    content: "The harbor smelled of salt and cold iron.",
    status: "edited",
    wordCount: 8,
  },
  // A soft-retired placeholder is outside the live manuscript in both versions.
  {
    id: "chapter-9",
    chapterNumber: 9,
    title: null,
    summary: null,
    content: "",
    status: "planned",
    wordCount: 0,
  },
];

const fingerprints = rows.map(({ content, ...row }) => ({
  ...row,
  contentSha256: contentDigest(content),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selections.length = 0;
  mocks.getDb.mockReturnValue({
    select: vi.fn((selection: Record<string, unknown>) => {
      mocks.selections.push(selection);
      const result = "content" in selection ? rows : fingerprints;
      return { from: () => ({ where: () => Promise.resolve(result) }) };
    }),
  });
});

describe("manuscriptDigestV2", () => {
  it("matches the digest computed from full rows, so either path agrees", () => {
    expect(manuscriptDigestV2(fingerprints)).toBe(currentManuscriptFromRows(rows).digest);
  });

  it("changes when any chapter's prose changes", () => {
    const edited = fingerprints.map((row) =>
      row.chapterNumber === 1 ? { ...row, contentSha256: contentDigest("Different prose.") } : row,
    );
    expect(manuscriptDigestV2(edited)).not.toBe(manuscriptDigestV2(fingerprints));
  });

  it("ignores soft-retired placeholders and row order", () => {
    const live = fingerprints.filter((row) => row.chapterNumber !== 9).reverse();
    expect(manuscriptDigestV2(live)).toBe(manuscriptDigestV2(fingerprints));
  });
});

describe("loadCurrentManuscript", () => {
  it("hashes content in SQL and never selects the prose for a v2 comparison", async () => {
    const current = await loadCurrentManuscript("book-1");
    await expect(manuscriptDigestMatches(current.digest, current)).resolves.toBe(true);
    expect(mocks.selections).toHaveLength(1);
    expect(Object.keys(mocks.selections[0] as object)).not.toContain("content");
  });

  it("still matches a checkpoint written with the original digest", async () => {
    const current = await loadCurrentManuscript("book-1");
    await expect(manuscriptDigestMatches(manuscriptDigest(rows), current)).resolves.toBe(true);
    // The full load happens only for the legacy checkpoint, and only once.
    await manuscriptDigestMatches(manuscriptDigest(rows), current);
    expect(mocks.selections).toHaveLength(2);
  });

  it("rejects a stale checkpoint of either version", async () => {
    const current = await loadCurrentManuscript("book-1");
    await expect(manuscriptDigestMatches("v2:0000", current)).resolves.toBe(false);
    await expect(manuscriptDigestMatches("0000", current)).resolves.toBe(false);
    await expect(manuscriptDigestMatches(undefined, current)).resolves.toBe(false);
  });
});

describe("digestScopeKey", () => {
  it("uses sixteen hash characters for both versions", () => {
    const v2 = manuscriptDigestV2(fingerprints);
    expect(digestScopeKey(v2)).toBe(v2.slice(3, 19));
    expect(digestScopeKey(manuscriptDigest(rows))).toBe(manuscriptDigest(rows).slice(0, 16));
  });
});

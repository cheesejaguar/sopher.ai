import { describe, expect, it } from "vitest";

import {
  chapterTopologyFingerprint,
  cachedEditOutputAlreadyApplied,
  isSoftRetiredChapter,
  manuscriptDigest,
  outlineStateFingerprint,
  type ManuscriptStateRow,
} from "./manuscript-state";

const chapter = (overrides: Partial<ManuscriptStateRow> = {}): ManuscriptStateRow => ({
  id: "chapter-1",
  chapterNumber: 1,
  title: "The Door",
  summary: "Mara finds the door.",
  content: "The door opened.",
  status: "drafted",
  wordCount: 3,
  ...overrides,
});

describe("manuscript state fingerprints", () => {
  it("changes the manuscript digest, but not topology, for an author prose edit", () => {
    const before = [chapter()];
    const after = [chapter({ content: "The impossible door opened." })];

    expect(manuscriptDigest(after)).not.toBe(manuscriptDigest(before));
    expect(chapterTopologyFingerprint(after)).toBe(chapterTopologyFingerprint(before));
  });

  it.each([
    [
      "add",
      [
        chapter(),
        chapter({ id: "chapter-2", chapterNumber: 2 }),
        chapter({ id: "chapter-3", chapterNumber: 3 }),
      ],
    ],
    ["delete", []],
    ["move", [chapter({ chapterNumber: 2 }), chapter({ id: "chapter-2", chapterNumber: 1 })]],
  ])("changes topology after a chapter %s", (_operation, after) => {
    const before = [chapter(), chapter({ id: "chapter-2", chapterNumber: 2, title: "The Hall" })];
    expect(chapterTopologyFingerprint(after)).not.toBe(chapterTopologyFingerprint(before));
  });

  it("excludes soft-retired surplus placeholders from both fingerprints", () => {
    const retired = chapter({
      id: "chapter-99",
      chapterNumber: 99,
      title: null,
      summary: null,
      content: "",
      status: "planned",
      wordCount: 0,
    });
    expect(isSoftRetiredChapter(retired)).toBe(true);
    expect(manuscriptDigest([chapter(), retired])).toBe(manuscriptDigest([chapter()]));
    expect(chapterTopologyFingerprint([chapter(), retired])).toBe(
      chapterTopologyFingerprint([chapter()]),
    );
  });

  it("recognizes an edited output that committed before its completion checkpoint", () => {
    expect(
      cachedEditOutputAlreadyApplied("Edited prose.", {
        content: "Edited prose.",
        changed: true,
      }),
    ).toBe(true);
    expect(
      cachedEditOutputAlreadyApplied("Author changed it again.", {
        content: "Edited prose.",
        changed: true,
      }),
    ).toBe(false);
  });

  it("binds resume provenance to the exact persisted outline row", () => {
    const base = {
      id: "outline-1",
      version: 2,
      source: "ai",
      content: { chapters: [{ number: 1, title: "The Door" }] },
    };
    expect(outlineStateFingerprint(base)).not.toBe(
      outlineStateFingerprint({ ...base, id: "outline-2", version: 3, source: "user" }),
    );
  });
});

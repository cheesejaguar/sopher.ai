import { describe, expect, it } from "vitest";

import {
  applyRanges,
  countMatches,
  findMatchRanges,
  HEADLINE_START_SEL,
  HEADLINE_STOP_SEL,
  matchingEntityNames,
  parseHeadline,
  planBookReplace,
  renameEntity,
  replaceAllInText,
  snippetFor,
  type ChapterText,
} from "./replace-plan";

describe("findMatchRanges", () => {
  it("finds every non-overlapping occurrence, case-insensitively by default", () => {
    expect(findMatchRanges("Mara met mara, then MARA left.", "mara")).toEqual([
      { start: 0, end: 4 },
      { start: 9, end: 13 },
      { start: 20, end: 24 },
    ]);
  });

  it("honours case sensitivity", () => {
    expect(findMatchRanges("Mara met mara.", "Mara", { caseSensitive: true })).toEqual([
      { start: 0, end: 4 },
    ]);
  });

  it("does not overlap: 'aa' in 'aaaa' matches twice, not three times", () => {
    expect(findMatchRanges("aaaa", "aa")).toHaveLength(2);
  });

  it("returns nothing for an empty query or empty text", () => {
    expect(findMatchRanges("Mara", "")).toEqual([]);
    expect(findMatchRanges("", "Mara")).toEqual([]);
  });

  it("keeps offsets valid when case folding would change length", () => {
    // "İ" lowercases to two code units; a naive fold shifts every later offset.
    const text = "İstanbul, then Mara arrived.";
    const [range] = findMatchRanges(text, "mara");
    expect(text.slice(range.start, range.end)).toBe("Mara");
  });

  describe("whole word", () => {
    it("rejects hits glued to letters on either side", () => {
      expect(findMatchRanges("Marabou and Mara and Amara", "Mara", { wholeWord: true })).toEqual([
        { start: 12, end: 16 },
      ]);
    });

    it("still matches before punctuation, so possessives are renamed", () => {
      const text = "Mara's coat, Mara.";
      const ranges = findMatchRanges(text, "Mara", { wholeWord: true });
      expect(ranges).toHaveLength(2);
      expect(replaceAllInText(text, "Mara", "Sera", { wholeWord: true }).text).toBe(
        "Sera's coat, Sera.",
      );
    });

    it("does not let a rejected hit swallow a real one that starts inside it", () => {
      // "aa " — the hit at 0 is rejected (followed by 'a'), the hit at 1 is real.
      expect(findMatchRanges("xaa", "aa", { wholeWord: true })).toEqual([]);
      expect(findMatchRanges("aaa aa", "aa", { wholeWord: true })).toEqual([{ start: 4, end: 6 }]);
    });

    it("treats digits and underscores as word characters", () => {
      expect(findMatchRanges("R2 R2D2", "R2", { wholeWord: true })).toEqual([{ start: 0, end: 2 }]);
    });
  });
});

describe("applyRanges / replaceAllInText", () => {
  it("splices every range and reports how many landed", () => {
    expect(replaceAllInText("Mara met Mara.", "Mara", "Sera")).toEqual({
      text: "Sera met Sera.",
      replaced: 2,
    });
  });

  it("supports deletion and growth without corrupting later offsets", () => {
    expect(replaceAllInText("a-b-c", "-", "").text).toBe("abc");
    expect(replaceAllInText("a-b-c", "-", " — ").text).toBe("a — b — c");
  });

  it("leaves text untouched when nothing matches", () => {
    expect(applyRanges("unchanged", [], "x")).toBe("unchanged");
  });

  it("never rewrites its own output — replacing into a superstring stays finite", () => {
    expect(replaceAllInText("Mara", "Mara", "Mara Vance")).toEqual({
      text: "Mara Vance",
      replaced: 1,
    });
  });
});

describe("snippetFor", () => {
  const text =
    "The archive doors opened at midnight and Mara stepped through the frost into the reading room.";

  it("returns the match with context clipped at word boundaries", () => {
    const range = findMatchRanges(text, "Mara")[0];
    const snippet = snippetFor(text, range, 20);
    // Clipped mid-"opened" by radius alone; the boundary search moves it to "at".
    expect(snippet).toEqual({
      before: "…at midnight and ",
      match: "Mara",
      after: " stepped through the…",
    });
  });

  it("omits the ellipsis when the match is already at the edges", () => {
    const snippet = snippetFor("Mara", { start: 0, end: 4 });
    expect(snippet).toEqual({ before: "", match: "Mara", after: "" });
  });

  it("collapses newlines so a preview row stays one line", () => {
    const multiline = "First line.\n\nMara arrived.\n\nLast line.";
    const snippet = snippetFor(multiline, findMatchRanges(multiline, "Mara")[0]);
    expect(snippet.before).not.toContain("\n");
    expect(snippet.after).not.toContain("\n");
  });
});

describe("planBookReplace", () => {
  const chapters: ChapterText[] = [
    {
      chapterId: "c1",
      chapterNumber: 1,
      title: "The Archive",
      content: "Mara opened the door. Mara did not look back.",
      version: 3,
    },
    { chapterId: "c2", chapterNumber: 2, title: null, content: "Nobody was there.", version: 1 },
    {
      chapterId: "c3",
      chapterNumber: 3,
      title: null,
      content: "mara mara mara mara",
      version: 9,
    },
  ];

  it("skips chapters with no matches and carries each chapter's version", () => {
    const plan = planBookReplace(chapters, "Mara");
    expect(plan.map((row) => row.chapterId)).toEqual(["c1", "c3"]);
    expect(plan[0]).toMatchObject({ chapterNumber: 1, matchCount: 2, version: 3 });
    expect(plan[1]).toMatchObject({ matchCount: 4, version: 9 });
  });

  it("counts every match but caps the snippets it ships", () => {
    const plan = planBookReplace(chapters, "mara", {}, 2);
    expect(plan[1].matchCount).toBe(4);
    expect(plan[1].snippets).toHaveLength(2);
  });

  it("respects the options it was given", () => {
    expect(planBookReplace(chapters, "Mara", { caseSensitive: true })).toHaveLength(1);
  });
});

describe("entity canon", () => {
  const mara = { name: "Mara Vance", aliases: ["The Archivist", "Mara"] };

  it("reports which of an entry's names the query hits", () => {
    expect(matchingEntityNames(mara, "Mara")).toEqual({
      nameMatches: true,
      matchingAliases: ["Mara"],
    });
    expect(matchingEntityNames(mara, "Archivist")).toEqual({
      nameMatches: false,
      matchingAliases: ["The Archivist"],
    });
    expect(matchingEntityNames(mara, "Sera")).toEqual({
      nameMatches: false,
      matchingAliases: [],
    });
  });

  it("renames the name and every alias in one pass", () => {
    expect(renameEntity(mara, "Mara", "Sera")).toEqual({
      name: "Sera Vance",
      aliases: ["The Archivist", "Sera"],
      changed: true,
    });
  });

  it("drops an alias that collapses into the new name", () => {
    expect(renameEntity({ name: "Mara Vance", aliases: ["Mara"] }, "Mara Vance", "Mara")).toEqual({
      name: "Mara",
      aliases: [],
      changed: true,
    });
  });

  it("reports no change when the query only appears elsewhere in the canon", () => {
    expect(renameEntity(mara, "frost", "ice").changed).toBe(false);
  });
});

describe("parseHeadline", () => {
  const mark = (text: string) => `${HEADLINE_START_SEL}${text}${HEADLINE_STOP_SEL}`;

  it("splits a ts_headline excerpt into plain and matched runs", () => {
    expect(parseHeadline(`the ${mark("archive")} doors`)).toEqual([
      { text: "the ", highlight: false },
      { text: "archive", highlight: true },
      { text: " doors", highlight: false },
    ]);
  });

  it("handles several hits, including one at the very start", () => {
    expect(parseHeadline(`${mark("Mara")} and ${mark("Mara")}`)).toEqual([
      { text: "Mara", highlight: true },
      { text: " and ", highlight: false },
      { text: "Mara", highlight: true },
    ]);
  });

  it("passes prose containing markup through as plain text", () => {
    // The excerpt is rendered as text, so <b> is content and never markup.
    expect(parseHeadline("a <b>literal</b> tag")).toEqual([
      { text: "a <b>literal</b> tag", highlight: false },
    ]);
  });

  it("returns nothing for an empty excerpt", () => {
    expect(parseHeadline("")).toEqual([]);
  });
});

describe("countMatches", () => {
  it("is the length of the range list", () => {
    expect(countMatches("Mara Mara Mara", "Mara")).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import { isChapterComplete, isChapterProductionComplete, planFreshRunChapter } from "./resume";

const base = { content: "Some finished prose.", wordCount: 2900, qualityScore: "0.800" };

describe("isChapterComplete", () => {
  it("reuses drafted, edited, and final chapters with prose", () => {
    for (const status of ["drafted", "edited", "final"] as const) {
      expect(isChapterComplete({ ...base, status })).toBe(true);
    }
  });

  it("regenerates planned chapters and crashed mid-draft chapters", () => {
    expect(isChapterComplete({ ...base, status: "planned" })).toBe(false);
    expect(isChapterComplete({ ...base, status: "drafting" })).toBe(false);
  });

  it("regenerates chapters whose content is empty despite a finished status", () => {
    expect(
      isChapterComplete({ status: "drafted", content: "   ", wordCount: 0, qualityScore: null }),
    ).toBe(false);
  });

  it("handles missing rows", () => {
    expect(isChapterComplete(null)).toBe(false);
    expect(isChapterComplete(undefined)).toBe(false);
  });
});

describe("isChapterProductionComplete", () => {
  it("does not mistake an outline-prefilled summary for completed post-write upkeep", () => {
    expect(
      isChapterProductionComplete({ ...base, status: "drafted" }, undefined, "digest-of-prose"),
    ).toBe(false);
  });

  it("reuses only a checkpoint for the exact current prose", () => {
    const chapter = { ...base, status: "drafted" as const };
    expect(
      isChapterProductionComplete(chapter, { contentDigest: "digest-of-prose" }, "digest-of-prose"),
    ).toBe(true);
    expect(
      isChapterProductionComplete(chapter, { contentDigest: "old-digest" }, "digest-of-prose"),
    ).toBe(false);
  });

  it("accepts a matching downstream edit as proof earlier production already completed", () => {
    const chapter = { ...base, status: "edited" as const };
    expect(
      isChapterProductionComplete(chapter, { contentDigest: "pre-edit-digest" }, "edited-digest", {
        contentDigest: "edited-digest",
      }),
    ).toBe(true);
  });
});

describe("planFreshRunChapter", () => {
  const written = {
    status: "drafted" as const,
    content: "The old chapter prose.",
    wordCount: 4,
    qualityScore: "0.800",
  };

  it("archives prose before resetting a chapter for a fresh shape", () => {
    expect(planFreshRunChapter(written, false)).toEqual({ archive: true, reset: true });
  });

  it("does not duplicate an archive when retrying between archive and reset", () => {
    expect(planFreshRunChapter(written, true)).toEqual({ archive: false, reset: true });
  });

  it("makes a completed reset a no-op on retry", () => {
    expect(
      planFreshRunChapter(
        {
          status: "planned",
          content: "",
          wordCount: 0,
          qualityScore: null,
        },
        false,
      ),
    ).toEqual({ archive: false, reset: false });
  });
});

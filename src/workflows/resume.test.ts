import { describe, expect, it } from "vitest";
import { isChapterComplete } from "./resume";

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

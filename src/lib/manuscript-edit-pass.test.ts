import { describe, expect, it } from "vitest";

import {
  manuscriptEditMaximumCredits,
  manuscriptEditPassCompletionIsReady,
  normalizeManuscriptEditInstruction,
  readManuscriptEditPassCompletion,
} from "./manuscript-edit-pass";

describe("manuscript edit-pass contract", () => {
  it("normalizes an author direction without changing its meaning", () => {
    expect(
      normalizeManuscriptEditInstruction("  Make   the dialogue\n sharper, but keep the ending.  "),
    ).toBe("Make the dialogue sharper, but keep the ending.");
  });

  it("authorizes every chapter independently", () => {
    const one = manuscriptEditMaximumCredits("standard", 1);
    expect(one).toBeGreaterThan(0);
    expect(manuscriptEditMaximumCredits("standard", 3)).toBeCloseTo(one * 3, 4);
    expect(manuscriptEditMaximumCredits("standard", 0)).toBe(0);
  });

  it("accepts a run-owned zero-suggestion completion artifact", () => {
    const config = {
      editPass: {
        completion: {
          sourceRunId: "run-1",
          reviewedChapterCount: 8,
          suggestionCount: 0,
          completedAt: "2026-08-02T20:00:00.000Z",
        },
      },
    };
    expect(readManuscriptEditPassCompletion(config)).toMatchObject({ suggestionCount: 0 });
    expect(manuscriptEditPassCompletionIsReady("run-1", config)).toBe(true);
    expect(manuscriptEditPassCompletionIsReady("run-2", config)).toBe(false);
  });

  it("rejects malformed or incomplete completion claims", () => {
    expect(
      readManuscriptEditPassCompletion({
        editPass: {
          completion: {
            sourceRunId: "run-1",
            reviewedChapterCount: 2,
            suggestionCount: -1,
            completedAt: "not-a-date",
          },
        },
      }),
    ).toBeNull();
  });
});

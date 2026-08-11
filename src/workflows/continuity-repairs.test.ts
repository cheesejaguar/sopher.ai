import { describe, expect, it } from "vitest";

import type { ContinuityOutcome } from "@/ai/agents/continuity";
import {
  buildContinuityChapterRepairs,
  continuityRevisionStatus,
  continuityRepairProgress,
  isConfirmedTechnicalContinuityIssue,
} from "./continuity-repairs";

type Issue = ContinuityOutcome["result"]["issues"][number];

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    chapters: [2, 4],
    category: "timeline",
    severity: "major",
    description: "The crossing lasts two days in chapter 2 and five days in chapter 4.",
    suggestedFix: "Keep the crossing at two days in both chapters.",
    fixability: "auto_fixable",
    confidence: 0.95,
    repairChapters: [4],
    ...overrides,
  };
}

function outcome(key: ContinuityOutcome["key"], issues: Issue[]): ContinuityOutcome {
  return {
    key,
    weight: 0.15,
    result: { score: 0.7, summary: "Review", strengths: [], issues },
  };
}

describe("isConfirmedTechnicalContinuityIssue", () => {
  it.each([
    "Verify that four weeks fits within the quarter.",
    "Double-check whether the repeated number is intentional.",
    "Consider adding a callback near the ending.",
    "No change is needed; leave this passage unchanged.",
  ])("keeps a non-actionable fix as a note: %s", (suggestedFix) => {
    expect(isConfirmedTechnicalContinuityIssue(issue({ suggestedFix }))).toBe(false);
  });

  it("rejects hedged findings and accepts a concrete correction", () => {
    expect(
      isConfirmedTechnicalContinuityIssue(
        issue({ description: "The crossing may be two or five days depending on interpretation." }),
      ),
    ).toBe(false);
    expect(isConfirmedTechnicalContinuityIssue(issue())).toBe(true);
  });

  it("requires explicit high-confidence automatic repair authority", () => {
    expect(isConfirmedTechnicalContinuityIssue(issue({ fixability: "informational" }))).toBe(false);
    expect(isConfirmedTechnicalContinuityIssue(issue({ fixability: "needs_author_choice" }))).toBe(
      false,
    );
    expect(isConfirmedTechnicalContinuityIssue(issue({ confidence: 0.849 }))).toBe(false);
    expect(isConfirmedTechnicalContinuityIssue(issue({ repairChapters: [] }))).toBe(false);
    expect(
      isConfirmedTechnicalContinuityIssue(
        issue({ description: "If the first account is canon, chapter 4 contradicts it." }),
      ),
    ).toBe(false);
    expect(
      isConfirmedTechnicalContinuityIssue(
        issue({ suggestedFix: "If the author intended two days, use that duration." }),
      ),
    ).toBe(false);
  });
});

describe("continuityRevisionStatus", () => {
  it("keeps delivered chapters final while production-time drafts remain edited", () => {
    expect(continuityRevisionStatus("final")).toBe("final");
    expect(continuityRevisionStatus("edited")).toBe("edited");
    expect(continuityRevisionStatus("drafted")).toBe("edited");
  });
});

describe("continuityRepairProgress", () => {
  it("never counts no-op or failed chapter attempts as applied", () => {
    expect(continuityRepairProgress(4, 1)).toEqual({
      processedChapterCount: 4,
      appliedChapterCount: 1,
      unresolvedChapterCount: 3,
      detail: "1 chapter changed automatically; 3 chapters need author review",
    });
  });
});

describe("buildContinuityChapterRepairs", () => {
  it("targets a critical technical error even when the review score is above 0.7", () => {
    const technical = outcome("technical_consistency", [
      issue({ severity: "critical", chapters: [2], repairChapters: [2] }),
    ]);
    technical.result.score = 0.96;

    expect(
      buildContinuityChapterRepairs({
        targetChapters: 4,
        writtenChapterNumbers: [1, 2, 3, 4],
        outcomes: [technical],
      }).map((entry) => entry.chapterNumber),
    ).toEqual([2]);
  });

  it("uses only confirmed technical findings and scopes notes to cited written chapters", () => {
    const plan = buildContinuityChapterRepairs({
      targetChapters: 4,
      writtenChapterNumbers: [1, 2, 3, 4],
      outcomes: [
        outcome("narrative_structure", [
          issue({
            chapters: [1],
            category: "plot",
            description: "The ending would feel stronger with another callback.",
            suggestedFix: "Add a callback to the opening image.",
          }),
        ]),
        outcome("technical_consistency", [
          issue(),
          issue({
            chapters: [3],
            description: "The repeated figure could be an intentional motif.",
            suggestedFix: "Verify whether the repetition is deliberate.",
          }),
        ]),
      ],
    });

    expect(plan.map((entry) => entry.chapterNumber)).toEqual([4]);
    expect(plan[0]?.issueNotes).toContain("two days in chapter 2 and five days in chapter 4");
    expect(plan[0]?.issueNotes).not.toContain("callback");
    expect(plan[0]?.issueNotes).not.toContain("intentional motif");
  });

  it("drops cited chapters that are unwritten or outside the current target", () => {
    const plan = buildContinuityChapterRepairs({
      targetChapters: 4,
      writtenChapterNumbers: [2, 5],
      outcomes: [
        outcome("technical_consistency", [issue({ chapters: [2, 4, 5, 99], repairChapters: [2] })]),
      ],
    });

    expect(plan.map((entry) => entry.chapterNumber)).toEqual([2]);
  });

  it("combines multiple confirmed findings only for the chapters each one cites", () => {
    const plan = buildContinuityChapterRepairs({
      targetChapters: 4,
      writtenChapterNumbers: [1, 2, 3, 4],
      outcomes: [
        outcome("technical_consistency", [
          issue({ chapters: [1, 2], repairChapters: [2] }),
          issue({
            chapters: [2, 3],
            repairChapters: [3],
            category: "character",
            description: "Mira's eyes change from gray to green.",
            suggestedFix: "Keep Mira's eyes gray.",
          }),
        ]),
      ],
    });

    expect(plan.map((entry) => entry.chapterNumber)).toEqual([2, 3]);
    expect(plan[0]?.issueNotes).not.toContain("Mira's eyes");
    expect(plan[1]?.issueNotes).toContain("Mira's eyes");
    expect(plan[1]?.issueNotes).not.toContain("crossing lasts");
  });

  it("rejects an issue when any explicit repair target is outside its evidence or written prose", () => {
    expect(
      buildContinuityChapterRepairs({
        targetChapters: 4,
        writtenChapterNumbers: [1, 2, 3, 4],
        outcomes: [
          outcome("technical_consistency", [issue({ chapters: [2, 4], repairChapters: [3] })]),
        ],
      }),
    ).toEqual([]);

    expect(
      buildContinuityChapterRepairs({
        targetChapters: 4,
        writtenChapterNumbers: [1, 2, 3],
        outcomes: [
          outcome("technical_consistency", [issue({ chapters: [2, 4], repairChapters: [4] })]),
        ],
      }),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { suggestionsForReviewRun, type SuggestionDTO } from "./types";

function suggestion(
  id: string,
  passType: SuggestionDTO["passType"],
  runId: string | null,
  status: SuggestionDTO["status"] = "pending",
): SuggestionDTO {
  return {
    id,
    chapterId: "chapter-1",
    runId,
    chapterVersion: 1,
    passType,
    suggestionType: passType,
    severity: "info",
    anchor: { start: 0, end: 4, originalText: "Once" },
    suggestedText: "Long ago",
    explanation: "A concrete change",
    status,
  };
}

describe("suggestionsForReviewRun", () => {
  it("keeps only pending review rows from the exact manuscript run", () => {
    const rows = [
      suggestion("current", "review", "run-current"),
      suggestion("older", "review", "run-older"),
      suggestion("manual", "selection", null),
      suggestion("proofread", "proofread", null),
      suggestion("resolved", "review", "run-current", "applied"),
    ];

    expect(suggestionsForReviewRun(rows, "run-current").map((row) => row.id)).toEqual(["current"]);
  });

  it("preserves the ordinary all-suggestions chapter view without a scope", () => {
    const rows = [
      suggestion("review", "review", "run-current"),
      suggestion("manual", "selection", null),
    ];
    expect(suggestionsForReviewRun(rows, null)).toEqual(rows);
  });
});

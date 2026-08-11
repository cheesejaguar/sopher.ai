import { describe, expect, it } from "vitest";

import { persistChapterReviewDelivery } from "./chapter-review-delivery";

describe("persistChapterReviewDelivery", () => {
  it("rejects an unchanged replacement before opening a database transaction", async () => {
    await expect(
      persistChapterReviewDelivery({
        userId: "user-1",
        projectId: "project-1",
        chapterId: "11111111-1111-4111-8111-111111111111",
        operationKey: "22222222-2222-4222-8222-222222222222",
        suggestions: [
          {
            chapterId: "11111111-1111-4111-8111-111111111111",
            chapterVersion: 2,
            passType: "review",
            suggestionType: "structure",
            severity: "info",
            anchor: {
              start: 0,
              end: 27,
              originalText: "This passage needs no change.",
            },
            suggestedText: "This passage needs no change.",
            explanation: "Good as written",
            status: "pending",
          },
        ],
        skipped: 0,
        meteredUsd: 0.01,
        optionalLeaseRefs: [],
      }),
    ).rejects.toThrow("unchanged replacement");
  });
});

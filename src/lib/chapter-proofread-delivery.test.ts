import { describe, expect, it } from "vitest";

import { persistChapterProofreadDelivery } from "./chapter-proofread-delivery";

describe("persistChapterProofreadDelivery", () => {
  it("rejects an unchanged replacement before opening a database transaction", async () => {
    await expect(
      persistChapterProofreadDelivery({
        userId: "user-1",
        projectId: "project-1",
        chapterId: "11111111-1111-4111-8111-111111111111",
        operationKey: "22222222-2222-4222-8222-222222222222",
        suggestions: [
          {
            chapterId: "11111111-1111-4111-8111-111111111111",
            chapterVersion: 2,
            passType: "proofread",
            suggestionType: "grammar",
            severity: "info",
            anchor: {
              start: 0,
              end: 30,
              originalText: "This sentence stays as written.",
            },
            suggestedText: "This sentence stays as written.",
            explanation: "No correction needed",
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

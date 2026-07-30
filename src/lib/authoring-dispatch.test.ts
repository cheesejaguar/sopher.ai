import { describe, expect, it } from "vitest";

import { schema } from "@/db";
import { buildDispatchReadyFullBookConfig } from "@/lib/authoring-dispatch";
import type { GenerationConfig } from "@/lib/run-events";

function project(
  overrides: Partial<typeof schema.projects.$inferSelect> = {},
): typeof schema.projects.$inferSelect {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-1",
    title: "Final persisted title",
    brief: "The final persisted brief is the only one Workflow may receive.",
    genre: "Fantasy",
    subgenre: null,
    protagonist: null,
    setting: null,
    styleGuide: null,
    targetChapters: 7,
    targetWordsPerChapter: 2_200,
    status: "draft",
    experience: "full_book",
    creationKey: null,
    settings: {},
    completedAt: null,
    createdAt: new Date("2026-07-30T12:00:00.000Z"),
    updatedAt: new Date("2026-07-30T12:00:00.000Z"),
    ...overrides,
  };
}

describe("dispatch-ready full-book snapshot", () => {
  it("rebuilds mutable author input from the post-insert project snapshot", () => {
    const requested = {
      tier: "premium",
      requireOutlineApproval: false,
      waveSize: 4,
      targetChapters: 12,
      targetWordsPerChapter: 4_000,
      inputSnapshot: {
        workingTitle: "Stale optimistic title",
        brief: "A stale optimistic brief that must not be dispatched.",
        genre: "Mystery",
        styleGuide: null,
        voiceProfile: null,
        pov: null,
        tense: null,
        tone: null,
        styleProfile: null,
        heatLevel: null,
        violenceLevel: null,
        profanity: null,
        avoidTopics: [],
      },
      resumeFromRunId: "stale-lineage",
      billingLineageRunId: "stale-lineage",
    } satisfies Partial<GenerationConfig>;

    const config = buildDispatchReadyFullBookConfig({
      project: project(),
      requested,
      chapterRows: [],
      latestOutline: undefined,
      priorRuns: [],
    });

    expect(config).toMatchObject({
      dispatchReady: true,
      productionMode: "full_book",
      tier: "premium",
      requireOutlineApproval: false,
      targetChapters: 7,
      targetWordsPerChapter: 2_200,
      inputSnapshot: {
        workingTitle: "Final persisted title",
        brief: "The final persisted brief is the only one Workflow may receive.",
        genre: "Fantasy",
      },
    });
    expect(config).not.toHaveProperty("resumeFromRunId");
    expect(config).not.toHaveProperty("billingLineageRunId");
  });

  it("reapplies the fixed included-story shape even if the optimistic payload was tampered", () => {
    const config = buildDispatchReadyFullBookConfig({
      project: project({
        experience: "trial_short_story",
        targetChapters: 60,
        targetWordsPerChapter: 8_000,
      }),
      requested: {
        tier: "premium",
        requireOutlineApproval: false,
      },
      chapterRows: [],
      latestOutline: undefined,
      priorRuns: [],
    });

    expect(config).toMatchObject({
      dispatchReady: true,
      productionMode: "trial_short_story",
      tier: "standard",
      requireOutlineApproval: true,
      waveSize: 1,
      targetChapters: 3,
      targetWordsPerChapter: 1_000,
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  buildBookGenerationConfig,
  buildChapterRegenerationConfig,
  type StartableProject,
} from "./book-start";

function project(overrides: Partial<StartableProject> = {}): StartableProject {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "The River Door",
    brief: "A cartographer follows a disappearing road into a forgotten country.",
    genre: "Fantasy",
    styleGuide: null,
    targetChapters: 3,
    targetWordsPerChapter: 1_000,
    settings: {},
    experience: "trial_short_story",
    ...overrides,
  };
}

describe("book start snapshot", () => {
  it("freezes the included story shape and author-owned title", () => {
    expect(
      buildBookGenerationConfig(
        project({
          targetChapters: 60,
          targetWordsPerChapter: 8_000,
          settings: {
            qualityTier: "premium",
            requireOutlineApproval: false,
            pov: "first",
          },
        }),
      ),
    ).toMatchObject({
      productionMode: "trial_short_story",
      tier: "standard",
      requireOutlineApproval: true,
      waveSize: 1,
      targetChapters: 3,
      targetWordsPerChapter: 1_000,
      inputSnapshot: {
        workingTitle: "The River Door",
        pov: "first",
      },
    });
  });

  it("retains paid full-book production choices", () => {
    expect(
      buildBookGenerationConfig(
        project({
          experience: "full_book",
          targetChapters: 12,
          targetWordsPerChapter: 3_000,
          settings: { qualityTier: "premium", requireOutlineApproval: false },
        }),
      ),
    ).toMatchObject({
      productionMode: "full_book",
      tier: "premium",
      requireOutlineApproval: false,
      waveSize: 4,
      targetChapters: 12,
      targetWordsPerChapter: 3_000,
    });
  });

  it("regenerates trial chapters with the same fixed entitlement and title snapshot", () => {
    expect(
      buildChapterRegenerationConfig(
        project({
          targetChapters: 60,
          targetWordsPerChapter: 8_000,
          settings: { qualityTier: "premium", requireOutlineApproval: true },
        }),
      ),
    ).toMatchObject({
      productionMode: "trial_short_story",
      tier: "standard",
      requireOutlineApproval: false,
      waveSize: 1,
      targetChapters: 3,
      targetWordsPerChapter: 1_000,
      chapterRegeneration: true,
      inputSnapshot: { workingTitle: "The River Door" },
    });
  });
});

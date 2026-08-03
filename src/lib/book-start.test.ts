import { describe, expect, it } from "vitest";

import {
  buildBookGenerationConfig,
  buildChapterRegenerationConfig,
  canReattachBookStart,
  canReattachChapterRegeneration,
  type StartableProject,
} from "./book-start";

function project(overrides: Partial<StartableProject> = {}): StartableProject {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    updatedAt: new Date("2026-07-30T12:00:00.000Z"),
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
  it("reattaches only to a full-book run, never a chapter or editorial run", () => {
    expect(canReattachBookStart("full_book")).toBe(true);
    expect(canReattachBookStart("chapter")).toBe(false);
    expect(canReattachBookStart("edit_pass")).toBe(false);
    expect(canReattachBookStart("continuity")).toBe(false);
    expect(canReattachBookStart("export")).toBe(false);
  });

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
      protocolVersion: 3,
      interaction: { mode: "guided", maxQuestions: 1 },
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
      protocolVersion: 3,
      interaction: { mode: "guided", maxQuestions: 1 },
      productionMode: "full_book",
      tier: "premium",
      requireOutlineApproval: false,
      waveSize: 4,
      targetChapters: 12,
      targetWordsPerChapter: 3_000,
    });
  });

  it("freezes an author's autopilot choice without a creative-decision pause", () => {
    expect(
      buildBookGenerationConfig(
        project({
          experience: "full_book",
          settings: { authoringMode: "autopilot" },
        }),
      ).interaction,
    ).toEqual({ mode: "autopilot", maxQuestions: 0 });
  });

  it("regenerates trial chapters with the same fixed entitlement and title snapshot", () => {
    const target = {
      chapterId: "22222222-2222-4222-8222-222222222222",
      chapterNumber: 2,
    };
    const config = buildChapterRegenerationConfig(
      project({
        targetChapters: 60,
        targetWordsPerChapter: 8_000,
        settings: { qualityTier: "premium", requireOutlineApproval: true },
      }),
      target,
    );

    expect(config).toMatchObject({
      productionMode: "trial_short_story",
      tier: "standard",
      requireOutlineApproval: false,
      waveSize: 1,
      targetChapters: 3,
      targetWordsPerChapter: 1_000,
      chapterRegeneration: true,
      chapterRegenerationTarget: target,
      inputSnapshot: { workingTitle: "The River Door" },
    });
    expect(canReattachChapterRegeneration(config, target)).toBe(true);
    expect(
      canReattachChapterRegeneration(config, {
        ...target,
        chapterNumber: target.chapterNumber + 1,
      }),
    ).toBe(false);
    expect(
      canReattachChapterRegeneration(config, {
        ...target,
        chapterId: "33333333-3333-4333-8333-333333333333",
      }),
    ).toBe(false);
    expect(
      canReattachChapterRegeneration({ ...config, chapterRegenerationTarget: undefined }, target),
    ).toBe(false);
  });
});

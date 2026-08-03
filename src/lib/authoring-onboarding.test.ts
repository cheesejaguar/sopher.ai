import { describe, expect, it } from "vitest";

import {
  deriveAuthoringOnboardingSnapshot,
  deriveProductionChecklistMilestones,
  selectAuthoringOnboardingProject,
} from "./authoring-onboarding";

const base = {
  preferences: { version: 1, seenCoachmarks: [] },
  project: {
    id: "project-1",
    experience: "trial_short_story" as const,
  },
  shapedIdea: false,
  startedProduction: false,
  reviewedOutline: false,
  watchedChapters: false,
  editedManuscript: false,
  readOrExported: false,
  includedStoryCompleted: false,
  fullBookUnlocked: false,
  continuedFullLength: false,
};

describe("deriveAuthoringOnboardingSnapshot", () => {
  it("derives milestones from durable work and points the author back into the project", () => {
    const snapshot = deriveAuthoringOnboardingSnapshot({
      ...base,
      shapedIdea: true,
      startedProduction: true,
      reviewedOutline: true,
      watchedChapters: true,
    });

    expect(snapshot.completedCount).toBe(4);
    expect(snapshot.steps.map(({ id, complete }) => [id, complete])).toEqual([
      ["shape_idea", true],
      ["start_production", true],
      ["review_outline", true],
      ["watch_chapters", true],
      ["edit_manuscript", false],
      ["read_or_export", false],
      ["continue_full_length", false],
    ]);
    expect(snapshot.steps[4]?.href).toBe("/projects/project-1/editor");
    expect(snapshot.steps[6]?.href).toBe("/projects/project-1/write");
    expect(snapshot.steps[6]?.description).toMatch(/finish your included story first/i);
  });

  it("resets a stale dismissal when the guidance version changes", () => {
    const snapshot = deriveAuthoringOnboardingSnapshot({
      ...base,
      preferences: {
        version: 0,
        dismissedAt: "2025-01-01T00:00:00.000Z",
        seenCoachmarks: ["mobile_navigation"],
      },
    });

    expect(snapshot.dismissed).toBe(false);
    expect(snapshot.seenCoachmarks).toEqual([]);
  });

  it("keeps the checklist useful before a project exists", () => {
    const snapshot = deriveAuthoringOnboardingSnapshot({ ...base, project: null });

    expect(snapshot.steps[0]).toMatchObject({ href: "/studio/new", complete: false });
    expect(snapshot.steps[1]).toMatchObject({ href: "/studio/new", complete: false });
  });

  it("offers checkout only after the included story is finished", () => {
    const snapshot = deriveAuthoringOnboardingSnapshot({
      ...base,
      readOrExported: true,
      includedStoryCompleted: true,
    });

    expect(snapshot.steps[6]).toMatchObject({
      complete: false,
      href: "/studio/credits?return=%2Fstudio%2Fnew%3Ffrom%3Dproject-1",
    });
  });

  it("does not treat an incomplete export as story completion", () => {
    const snapshot = deriveAuthoringOnboardingSnapshot({
      ...base,
      readOrExported: true,
      includedStoryCompleted: false,
    });

    expect(snapshot.steps[5]?.complete).toBe(true);
    expect(snapshot.steps[6]).toMatchObject({
      complete: false,
      href: "/projects/project-1/write",
    });
  });

  it("marks continuation complete only after a full-book project exists", () => {
    const snapshot = deriveAuthoringOnboardingSnapshot({
      ...base,
      readOrExported: true,
      includedStoryCompleted: true,
      fullBookUnlocked: true,
      continuedFullLength: true,
    });

    expect(snapshot.steps[6]).toMatchObject({
      complete: true,
      href: "/studio/new?from=project-1",
    });
  });
});

describe("deriveProductionChecklistMilestones", () => {
  const projects = [
    { id: "trial-1", experience: "trial_short_story" as const },
    { id: "full-1", experience: "full_book" as const },
  ];

  it("does not count project or queued-run creation as production", () => {
    expect(deriveProductionChecklistMilestones(projects, [])).toEqual({
      startedProduction: false,
      continuedFullLength: false,
    });
  });

  it("requires durable work on the full-length project before marking continuation", () => {
    expect(deriveProductionChecklistMilestones(projects, ["trial-1"])).toEqual({
      startedProduction: true,
      continuedFullLength: false,
    });
    expect(deriveProductionChecklistMilestones(projects, ["trial-1", "full-1"])).toEqual({
      startedProduction: true,
      continuedFullLength: true,
    });
  });
});

describe("selectAuthoringOnboardingProject", () => {
  it("prefers the newest active paid full book over an older included story", () => {
    expect(
      selectAuthoringOnboardingProject([
        { id: "full-new", experience: "full_book", status: "generating" },
        { id: "trial-old", experience: "trial_short_story", status: "editing" },
      ]),
    ).toMatchObject({ id: "full-new" });
  });

  it("falls back to the included story and then an archived project", () => {
    expect(
      selectAuthoringOnboardingProject([
        { id: "trial-active", experience: "trial_short_story", status: "editing" },
        { id: "full-archived", experience: "full_book", status: "archived" },
      ]),
    ).toMatchObject({ id: "trial-active" });
    expect(
      selectAuthoringOnboardingProject([
        { id: "trial-archived", experience: "trial_short_story", status: "archived" },
      ]),
    ).toMatchObject({ id: "trial-archived" });
  });
});

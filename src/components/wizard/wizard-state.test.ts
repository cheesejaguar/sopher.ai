import { describe, expect, it } from "vitest";

import { TRIAL_STORY_CONFIG } from "@/lib/trial-story";

import {
  applyTrialStoryShape,
  clearLegacyWizardStorage,
  composeTitle,
  initialWizardState,
  LEGACY_WIZARD_DRAFT_KEY,
  LEGACY_WIZARD_REQUEST_KEY,
  restoreDraft,
  serializeDraft,
  stepComplete,
  wizardDraftKey,
  wizardRequestKey,
} from "./wizard-state";

describe("wizard state", () => {
  it("requires both a working title and a meaningful brief", () => {
    const untitled = {
      ...initialWizardState,
      genre: "mystery" as const,
      brief: "A detective follows a secret into the old harbor.",
    };
    expect(stepComplete(untitled, 1)).toBe(false);
    expect(stepComplete({ ...untitled, title: "The Harbor Light" }, 1)).toBe(true);
  });

  it("never fabricates an Untitled project identity", () => {
    expect(composeTitle({ ...initialWizardState, genre: "mystery" })).toBe("");
    expect(composeTitle({ ...initialWizardState, title: "  Night Crossing  " })).toBe(
      "Night Crossing",
    );
  });

  it("restores answers at Step 1 instead of restoring navigation position", () => {
    const restored = restoreDraft(
      serializeDraft(
        {
          ...initialWizardState,
          step: 3,
          genre: "fantasy",
          title: "The Glass Road",
          brief: "A courier discovers the road remembers everyone who crossed it.",
        },
        "trial_short_story",
      ),
      "trial_short_story",
    );
    expect(restored).toMatchObject({
      step: 0,
      genre: "fantasy",
      title: "The Glass Road",
      authoringMode: "guided",
    });
  });

  it("preserves the optional authoring mode in a saved setup", () => {
    const restored = restoreDraft(
      serializeDraft({ ...initialWizardState, authoringMode: "autopilot" }, "full_book"),
      "full_book",
    );

    expect(restored?.authoringMode).toBe("autopilot");
  });

  it("uses separate account- and experience-scoped draft and request keys", () => {
    expect(wizardDraftKey("user-a", "full_book")).not.toBe(wizardDraftKey("user-b", "full_book"));
    expect(wizardRequestKey("user-a", "full_book")).not.toBe(
      wizardRequestKey("user-b", "full_book"),
    );
    expect(wizardDraftKey("user-a", "trial_short_story")).not.toBe(
      wizardDraftKey("user-a", "full_book"),
    );
    expect(wizardRequestKey("user-a", "trial_short_story")).not.toBe(
      wizardRequestKey("user-a", "full_book"),
    );
    expect(wizardDraftKey("user-a", "full_book")).not.toBe(wizardRequestKey("user-a", "full_book"));
  });

  it("refuses to restore a draft under a different production experience", () => {
    const trialDraft = serializeDraft(
      {
        ...initialWizardState,
        genre: "fantasy",
        title: "The Glass Road",
        brief: "A courier discovers the road remembers everyone who crossed it.",
      },
      "trial_short_story",
    );

    expect(restoreDraft(trialDraft, "trial_short_story")).not.toBeNull();
    expect(restoreDraft(trialDraft, "full_book")).toBeNull();
  });

  it("cleans browser-global and account-scoped v1 identities", () => {
    const values = new Set([
      LEGACY_WIZARD_DRAFT_KEY,
      LEGACY_WIZARD_REQUEST_KEY,
      `${LEGACY_WIZARD_DRAFT_KEY}:user-a`,
      `${LEGACY_WIZARD_REQUEST_KEY}:user-a`,
      `${LEGACY_WIZARD_DRAFT_KEY}:user-b`,
    ]);

    clearLegacyWizardStorage(
      {
        removeItem: (key) => {
          values.delete(key);
        },
      },
      "user-a",
    );

    expect(values).toEqual(new Set([`${LEGACY_WIZARD_DRAFT_KEY}:user-b`]));
  });

  it("derives the included story shape from the shared authority", () => {
    const state = applyTrialStoryShape({
      ...initialWizardState,
      chapters: 24,
      wordsPerChapter: 4_000,
      tier: "premium",
      requireOutlineApproval: false,
    });
    expect(state).toMatchObject({
      chapters: TRIAL_STORY_CONFIG.targetChapters,
      wordsPerChapter: TRIAL_STORY_CONFIG.targetWordsPerChapter,
      tier: TRIAL_STORY_CONFIG.tier,
      requireOutlineApproval: true,
    });
  });
});

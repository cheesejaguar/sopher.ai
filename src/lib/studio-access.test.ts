import { describe, expect, it } from "vitest";

import { creditsForUsd, SIGNUP_GRANT_CREDITS } from "@/lib/billing/credits-shared";
import { deriveProjectSpendAccess, ProjectSpendAccessError } from "@/lib/project-spend-access";
import type { GenerationConfig } from "@/lib/run-events";
import { TRIAL_STORY_CONFIG } from "@/lib/trial-story";
import { freshOpeningRequiredUsd } from "@/workflows/opening-credit-plan";

import { deriveStudioAccess, hasPriorAuthoringEvidence, hasVerifiedEmail } from "./studio-access";

const baseFacts = {
  emailVerified: true,
  isAdmin: false,
  hasSettledPurchase: false,
  hasPriorMeteredUsage: false,
  trialProjectId: null,
};

describe("included-story entitlement", () => {
  it("accepts any verified Clerk email, even when the primary address is still unverified", () => {
    expect(
      hasVerifiedEmail([
        { verification: { status: "unverified" } },
        { verification: { status: "verified" } },
      ]),
    ).toBe(true);
    expect(hasVerifiedEmail([{ verification: { status: "unverified" } }])).toBe(false);
  });

  it("offers one server-owned short story to a verified unused account", () => {
    expect(deriveStudioAccess(baseFacts)).toMatchObject({
      creationExperience: "trial_short_story",
      canCreateTrial: true,
      fullBookUnlocked: false,
      reason: "trial_available",
    });
  });

  it("does not let an unverified account claim the trial", () => {
    expect(deriveStudioAccess({ ...baseFacts, emailVerified: false })).toMatchObject({
      creationExperience: null,
      canCreateTrial: false,
      reason: "verify_email",
    });
  });

  it("treats real metered history, but not a zero-work failure, as consumed", () => {
    expect(deriveStudioAccess({ ...baseFacts, hasPriorMeteredUsage: true })).toMatchObject({
      creationExperience: null,
      reason: "purchase_required",
    });
    expect(deriveStudioAccess(baseFacts).reason).toBe("trial_available");
  });

  it("keeps a deleted generated trial consumed when its durable LLM call survives", () => {
    expect(
      deriveStudioAccess({
        ...baseFacts,
        // Project deletion sets the surviving llm_calls.project_id/run_id to
        // null, but the account-scoped user_id evidence remains authoritative.
        trialProjectId: null,
        hasPriorMeteredUsage: true,
      }),
    ).toMatchObject({
      creationExperience: null,
      canCreateTrial: false,
      reason: "purchase_required",
    });
  });

  it("restores eligibility after deleting a zero-work trial draft", () => {
    expect(
      deriveStudioAccess({
        ...baseFacts,
        trialProjectId: null,
        hasPriorMeteredUsage: false,
      }),
    ).toMatchObject({
      creationExperience: "trial_short_story",
      canCreateTrial: true,
      reason: "trial_available",
    });
  });

  it.each([
    "meteredUsage",
    "generatedEvent",
    "generatedOutline",
    "generatedChapterRevision",
    "generatedAsset",
  ] as const)("treats %s as a durable prior-authoring backstop", (evidence) => {
    expect(
      hasPriorAuthoringEvidence({
        meteredUsage: false,
        generatedEvent: false,
        generatedOutline: false,
        generatedChapterRevision: false,
        generatedAsset: false,
        [evidence]: true,
      }),
    ).toBe(true);
  });

  it("keeps a manual-only legacy manuscript eligible", () => {
    expect(
      hasPriorAuthoringEvidence({
        meteredUsage: false,
        generatedEvent: false,
        generatedOutline: false,
        generatedChapterRevision: false,
        generatedAsset: false,
      }),
    ).toBe(false);
  });

  it("permanently unlocks full books after a settled purchase or for Admin", () => {
    expect(deriveStudioAccess({ ...baseFacts, hasSettledPurchase: true })).toMatchObject({
      creationExperience: "full_book",
      fullBookUnlocked: true,
    });
    expect(deriveStudioAccess({ ...baseFacts, isAdmin: true })).toMatchObject({
      creationExperience: "full_book",
      fullBookUnlocked: true,
    });
  });

  it("keeps the included story inside the welcome-credit opening gate", () => {
    const config: GenerationConfig = {
      ...TRIAL_STORY_CONFIG,
      inputSnapshot: {
        workingTitle: "The River Door",
        brief: "A cartographer follows a disappearing road into a forgotten country.",
        genre: "Fantasy",
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
    };
    expect(creditsForUsd(freshOpeningRequiredUsd(config))).toBeLessThanOrEqual(
      SIGNUP_GRANT_CREDITS,
    );
  });

  it("never grants the negative credit floor to an included story", () => {
    expect(
      deriveProjectSpendAccess({
        experience: "trial_short_story",
        isAdmin: false,
        hasSettledPurchase: false,
        optionalWorkDuringActiveRun: false,
      }),
    ).toMatchObject({ allowCreditFloor: false });
  });

  it("gates legacy full-book AI and competing optional trial work", () => {
    expect(() =>
      deriveProjectSpendAccess({
        experience: "full_book",
        isAdmin: false,
        hasSettledPurchase: false,
        optionalWorkDuringActiveRun: false,
      }),
    ).toThrowError(ProjectSpendAccessError);
    expect(() =>
      deriveProjectSpendAccess({
        experience: "trial_short_story",
        isAdmin: false,
        hasSettledPurchase: false,
        optionalWorkDuringActiveRun: true,
      }),
    ).toThrowError(ProjectSpendAccessError);
    expect(() =>
      deriveProjectSpendAccess({
        experience: "full_book",
        isAdmin: false,
        hasSettledPurchase: true,
        optionalWorkDuringActiveRun: true,
      }),
    ).toThrowError("Finish the current authoring run");
  });

  it("blocks every provider-backed operation while the account is suspended", () => {
    expect(() =>
      deriveProjectSpendAccess({
        experience: "trial_short_story",
        isAdmin: true,
        hasSettledPurchase: true,
        suspended: true,
        optionalWorkDuringActiveRun: false,
      }),
    ).toThrowError("suspended");
  });

  it("requires a purchase for another whole-story run after the included story completes", () => {
    expect(() =>
      deriveProjectSpendAccess({
        experience: "trial_short_story",
        isAdmin: false,
        hasSettledPurchase: false,
        optionalWorkDuringActiveRun: false,
        wholeStoryStartAfterCompletion: true,
      }),
    ).toThrowError("Purchase credits to start another complete story");

    expect(
      deriveProjectSpendAccess({
        experience: "trial_short_story",
        isAdmin: false,
        hasSettledPurchase: true,
        optionalWorkDuringActiveRun: false,
        wholeStoryStartAfterCompletion: true,
      }),
    ).toMatchObject({ fullBookUnlocked: true });
  });

  it("keeps incomplete retries and post-completion chapter/tools access available", () => {
    expect(
      deriveProjectSpendAccess({
        experience: "trial_short_story",
        isAdmin: false,
        hasSettledPurchase: false,
        optionalWorkDuringActiveRun: false,
        wholeStoryStartAfterCompletion: false,
      }),
    ).toMatchObject({ experience: "trial_short_story" });
    expect(
      deriveProjectSpendAccess({
        experience: "trial_short_story",
        isAdmin: false,
        hasSettledPurchase: false,
        optionalWorkDuringActiveRun: false,
        // Post-completion optional/chapter calls do not set the whole-story
        // start predicate, so the remaining balance stays usable.
        wholeStoryStartAfterCompletion: false,
      }),
    ).toMatchObject({ experience: "trial_short_story" });
  });
});

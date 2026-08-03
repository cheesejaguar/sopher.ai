import { describe, expect, it } from "vitest";

import {
  authoringStatusHref,
  authoringJourneyWithProgress,
  deriveAuthoringJourney,
  type AuthoringJourneyRun,
  type AuthoringJourneySeed,
  type AuthoringNextActionKind,
} from "@/lib/authoring-journey";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const RESUMED_RUN_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-07-30T12:00:00.000Z";

function run(overrides: Partial<AuthoringJourneyRun> = {}): AuthoringJourneyRun {
  return {
    id: RUN_ID,
    databaseStatus: "running",
    workflowStatus: "running",
    effectiveStatus: "running",
    stage: "chapters",
    progressPct: 45,
    stageDescription: "Drafting chapter 2",
    acceptedAt: NOW,
    startedAt: NOW,
    completedAt: null,
    lastUpdateAt: NOW,
    acceptanceUncertain: false,
    safeToRetry: false,
    authoringBegan: true,
    noWorkStarted: false,
    pause: null,
    health: "healthy",
    spend: { meteredUsd: 0.2, creditsUsed: 0.55, scope: "run" },
    ...overrides,
  };
}

function seed(
  overrides: {
    project?: Partial<AuthoringJourneySeed["project"]>;
    artifacts?: Partial<AuthoringJourneySeed["artifacts"]>;
    access?: Partial<AuthoringJourneySeed["access"]>;
    run?: AuthoringJourneyRun | null;
  } = {},
): AuthoringJourneySeed {
  return {
    project: {
      id: PROJECT_ID,
      title: "The Night Ferry",
      genre: "mystery",
      status: "draft",
      experience: "trial_short_story",
      updatedAt: NOW,
      targetChapters: 3,
      targetWordsPerChapter: 1000,
      qualityTier: "standard",
      brief: "A ferryman discovers that one passenger died ten years ago.",
      completedAt: null,
      ...overrides.project,
    },
    artifacts: {
      bookReady: true,
      outlineReady: false,
      savedChapters: 0,
      savedCheckpoints: 0,
      editedChapters: 0,
      finalChapters: 0,
      totalChapters: 3,
      wordCount: 0,
      ...overrides.artifacts,
    },
    access: {
      fullBookUnlocked: false,
      suspended: false,
      balanceCredits: 100,
      ...overrides.access,
    },
    spend: { meteredUsd: 0, creditsUsed: 0 },
    run: overrides.run === undefined ? null : overrides.run,
  };
}

describe("authoringStatusHref", () => {
  it("targets the mounted full-book status surface for every run state", () => {
    expect(authoringStatusHref(PROJECT_ID, null)).toBe(`/projects/${PROJECT_ID}/write`);
    expect(authoringStatusHref(PROJECT_ID, run())).toBe(
      `/projects/${PROJECT_ID}/write#production-status`,
    );
    expect(
      authoringStatusHref(PROJECT_ID, run({ effectiveStatus: "failed", stage: "failed" })),
    ).toBe(`/projects/${PROJECT_ID}/write#authoring-recovery`);
    expect(
      authoringStatusHref(PROJECT_ID, run({ effectiveStatus: "cancelled", stage: "cancelled" })),
    ).toBe(`/projects/${PROJECT_ID}/write#authoring-recovery`);
    expect(
      authoringStatusHref(
        PROJECT_ID,
        run({
          databaseStatus: "completed",
          effectiveStatus: "completed",
          stage: "done",
          completionArtifactsReady: true,
        }),
      ),
    ).toBe(`/projects/${PROJECT_ID}/write`);
    expect(
      authoringStatusHref(
        PROJECT_ID,
        run({
          databaseStatus: "completed",
          effectiveStatus: "completed",
          stage: "done",
          completionArtifactsReady: false,
        }),
      ),
    ).toBe(`/projects/${PROJECT_ID}/write#authoring-recovery`);
  });

  it("targets the persistent editor status surface for scoped runs", () => {
    expect(authoringStatusHref(PROJECT_ID, run({ kind: "chapter", stage: "failed" }))).toBe(
      `/projects/${PROJECT_ID}/editor#editor-production-status`,
    );
  });
});

describe("deriveAuthoringJourney", () => {
  const cases: Array<{
    name: string;
    input: AuthoringJourneySeed;
    action: AuthoringNextActionKind;
    href: string;
  }> = [
    {
      name: "sends a valid brief with no run to production preflight",
      input: seed(),
      action: "start_production",
      href: `/projects/${PROJECT_ID}/write`,
    },
    {
      name: "sends an incomplete brief back to setup",
      input: seed({ project: { brief: "  " } }),
      action: "complete_setup",
      href: `/projects/${PROJECT_ID}/brief`,
    },
    {
      name: "keeps an active run in the writing room",
      input: seed({ run: run() }),
      action: "watch_production",
      href: `/projects/${PROJECT_ID}/write#production-status`,
    },
    {
      name: "takes a creative pause to the exact Write decision",
      input: seed({
        run: run({
          databaseStatus: "awaiting_input",
          effectiveStatus: "awaiting_input",
          stage: "awaiting_guidance",
          pause: { kind: "creative_decision", version: 1 },
          health: "waiting",
        }),
      }),
      action: "answer_question",
      href: `/projects/${PROJECT_ID}/write#creative-decision`,
    },
    {
      name: "takes an outline pause directly to review",
      input: seed({
        artifacts: { outlineReady: true },
        run: run({
          databaseStatus: "awaiting_input",
          effectiveStatus: "awaiting_input",
          stage: "awaiting_approval",
          pause: { kind: "outline_approval", version: 1 },
          health: "waiting",
        }),
      }),
      action: "review_outline",
      href: `/projects/${PROJECT_ID}/outline`,
    },
    {
      name: "takes a paid credit pause to checkout and back",
      input: seed({
        project: { experience: "full_book" },
        access: { fullBookUnlocked: true },
        artifacts: { outlineReady: true, savedChapters: 2 },
        run: run({
          databaseStatus: "awaiting_input",
          effectiveStatus: "awaiting_input",
          stage: "awaiting_credits",
          pause: {
            kind: "credits",
            version: 2,
            balanceCredits: 1.25,
            requiredCredits: 4.375,
          },
          health: "waiting",
        }),
      }),
      action: "add_credits",
      href: `/studio/credits?return=${encodeURIComponent(`/projects/${PROJECT_ID}/write`)}&resumeRun=${RUN_ID}`,
    },
    {
      name: "never converts an included-story credit pause into a purchase prompt",
      input: seed({
        run: run({
          databaseStatus: "awaiting_input",
          effectiveStatus: "awaiting_input",
          stage: "awaiting_credits",
          health: "waiting",
        }),
      }),
      action: "contact_support",
      href: "mailto:support@sopher.ai",
    },
    {
      name: "reconnects the same uncertain dispatch",
      input: seed({
        run: run({
          databaseStatus: "queued",
          effectiveStatus: "queued",
          stage: "queued",
          acceptanceUncertain: true,
          safeToRetry: true,
          authoringBegan: false,
          noWorkStarted: true,
          health: "waiting",
        }),
      }),
      action: "recover_dispatch",
      href: `/projects/${PROJECT_ID}/write#production-status`,
    },
    {
      name: "shows an explicit safe-stop state",
      input: seed({ run: run({ cancellationRequestedAt: NOW }) }),
      action: "finish_cancellation",
      href: `/projects/${PROJECT_ID}/write#production-status`,
    },
    {
      name: "offers checkpoint recovery after an interrupted included story",
      input: seed({
        artifacts: { savedChapters: 2, wordCount: 1900 },
        run: run({
          databaseStatus: "failed",
          workflowStatus: "failed",
          effectiveStatus: "failed",
          stage: "failed",
          health: "needs_attention",
        }),
      }),
      action: "recover_saved_work",
      href: `/projects/${PROJECT_ID}/write#authoring-recovery`,
    },
    {
      name: "keeps legacy saved prose editable without presenting purchase as a failure remedy",
      input: seed({
        project: { experience: "full_book" },
        artifacts: { savedChapters: 2, wordCount: 1900 },
        run: run({
          databaseStatus: "failed",
          workflowStatus: "failed",
          effectiveStatus: "failed",
          stage: "failed",
          health: "needs_attention",
        }),
      }),
      action: "edit_manuscript",
      href: `/projects/${PROJECT_ID}/editor`,
    },
    {
      name: "opens a partial manuscript in the editor when no run is active",
      input: seed({ artifacts: { savedChapters: 1, wordCount: 900 } }),
      action: "edit_manuscript",
      href: `/projects/${PROJECT_ID}/editor`,
    },
    {
      name: "opens a finished manuscript for reading and export",
      input: seed({
        project: { status: "complete", completedAt: NOW },
        artifacts: { savedChapters: 3, editedChapters: 3, finalChapters: 3, wordCount: 3000 },
        run: run({
          databaseStatus: "completed",
          workflowStatus: "completed",
          effectiveStatus: "completed",
          stage: "done",
          progressPct: 100,
          completedAt: NOW,
          completionArtifactsReady: true,
          health: "complete",
        }),
      }),
      action: "read_or_export",
      href: `/projects/${PROJECT_ID}/manuscript`,
    },
    {
      name: "requires a purchase only for a ready legacy full-book start",
      input: seed({ project: { experience: "full_book" } }),
      action: "unlock_full_book",
      href: "/studio/credits",
    },
    {
      name: "preserves a suspended author's brief and routes them to help",
      input: seed({ access: { suspended: true } }),
      action: "contact_support",
      href: "mailto:support@sopher.ai",
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const journey = deriveAuthoringJourney(testCase.input);
      expect(journey.nextAction.kind).toBe(testCase.action);
      expect(journey.nextAction.href).toContain(testCase.href);
      expect(journey.nextAction.label).not.toHaveLength(0);
      expect(journey.nextAction.description).not.toHaveLength(0);
    });
  }

  it("offers full-length continuation only after the included manuscript completes", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { status: "complete", completedAt: NOW },
        artifacts: { savedChapters: 3, finalChapters: 3, wordCount: 3000 },
        run: run({
          databaseStatus: "completed",
          workflowStatus: "completed",
          effectiveStatus: "completed",
          stage: "done",
          progressPct: 100,
          completionArtifactsReady: true,
          health: "complete",
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("read_or_export");
    expect(journey.purchaseAction).toMatchObject({
      kind: "unlock_full_book",
      label: "Continue this story at full length",
    });
  });

  it("does not route a contradictory completion to an invalid manuscript", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { status: "complete", completedAt: NOW },
        artifacts: { savedChapters: 2, finalChapters: 2, wordCount: 2100 },
        run: run({
          databaseStatus: "completed",
          workflowStatus: "completed",
          effectiveStatus: "completed",
          stage: "done",
          progressPct: 100,
          completionArtifactsReady: false,
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("contact_support");
    expect(journey.nextAction.description).toMatch(/without a complete, verifiable manuscript/i);
  });

  it("does not trust a database-only completed status when final artifacts are missing", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { status: "complete", completedAt: NOW },
        artifacts: {
          savedChapters: 2,
          editedChapters: 2,
          finalChapters: 2,
          totalChapters: 3,
          wordCount: 2100,
        },
        run: run({
          databaseStatus: "completed",
          workflowStatus: null,
          effectiveStatus: "completed",
          stage: "done",
          progressPct: 100,
          completionArtifactsReady: undefined,
          health: "complete",
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("contact_support");
    expect(journey.purchaseAction).toBeNull();
  });

  it("requires explicit run-owned completion proof even when project metadata and chapters look complete", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { status: "complete", completedAt: NOW },
        artifacts: { savedChapters: 3, finalChapters: 3, wordCount: 3000 },
        run: null,
      }),
    );

    expect(journey.nextAction.kind).toBe("contact_support");
    expect(journey.purchaseAction).toBeNull();
  });

  it.each([
    "completion_contradiction",
    "invalid_pause",
    "event_persistence",
    "metered_output_missing",
  ])("never offers restart or recovery for evidence-unsafe error code %s", (rootErrorCode) => {
    const journey = deriveAuthoringJourney(
      seed({
        artifacts: { savedChapters: 2, wordCount: 1900 },
        run: run({
          databaseStatus: "failed",
          workflowStatus: "failed",
          effectiveStatus: "failed",
          stage: "failed",
          rootErrorCode,
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("contact_support");
    expect(journey.nextAction.description).toMatch(/will not restart it automatically/i);
  });

  it("keeps a reconciled metering root error as audit history without blocking recovery", () => {
    const journey = deriveAuthoringJourney(
      seed({
        artifacts: { savedChapters: 2, wordCount: 1900 },
        run: run({
          databaseStatus: "failed",
          workflowStatus: "failed",
          effectiveStatus: "failed",
          stage: "failed",
          rootErrorCode: "metering_reconciliation_required",
          blockingIncidentCategories: [],
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("recover_saved_work");
  });

  it.each([
    "completion_contradiction",
    "invalid_pause",
    "event_persistence",
    "unresolved_metering",
  ])("never recovers while the %s incident remains unresolved", (category) => {
    const journey = deriveAuthoringJourney(
      seed({
        artifacts: { savedChapters: 2, wordCount: 1900 },
        run: run({
          databaseStatus: "failed",
          workflowStatus: "failed",
          effectiveStatus: "failed",
          stage: "failed",
          blockingIncidentCategories: [category],
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("contact_support");
    expect(journey.nextAction.kind).not.toBe("recover_saved_work");
  });

  it("surfaces the exact persisted credit requirement without rounding it to a whole credit", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { experience: "full_book" },
        access: { fullBookUnlocked: true },
        run: run({
          databaseStatus: "awaiting_input",
          effectiveStatus: "awaiting_input",
          stage: "awaiting_credits",
          pause: {
            kind: "credits",
            version: 3,
            balanceCredits: 1.25,
            requiredCredits: 4.375,
          },
          health: "waiting",
        }),
      }),
    );

    expect(journey.nextAction.description).toContain("4.375 credits");
    expect(journey.nextAction.description).toContain("balance is 1.25");
  });

  it("uses Add credits as the one next action for an underfunded ready full book", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { experience: "full_book" },
        access: { fullBookUnlocked: true, balanceCredits: 0 },
      }),
    );

    expect(journey.nextAction.kind).toBe("add_credits");
    expect(journey.nextAction.label).toBe("Add credits to start");
    expect(journey.nextAction.href).toContain(encodeURIComponent(`/projects/${PROJECT_ID}/write`));
  });

  it("post-modifies a metered recovery action when the account is suspended", () => {
    const journey = deriveAuthoringJourney(
      seed({
        access: { suspended: true },
        artifacts: { savedChapters: 2, wordCount: 1900 },
        run: run({
          databaseStatus: "failed",
          workflowStatus: "failed",
          effectiveStatus: "failed",
          stage: "failed",
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("contact_support");
    expect(journey.nextAction.description).toMatch(/saved chapter remains|saved chapters remain/i);
  });

  it("uses the persisted content-free support reference", () => {
    const journey = deriveAuthoringJourney(
      seed({
        run: run({
          health: "needs_attention",
          supportReference: "33333333-3333-4333-8333-333333333333",
        }),
      }),
    );

    expect(journey.supportReference).toBe("33333333-3333-4333-8333-333333333333");
    expect(journey.nextAction.href).toContain("33333333-3333-4333-8333-333333333333");
    expect(journey.nextAction.href).not.toContain("The%20Night%20Ferry");
  });

  it("gives a cancellation request precedence over pauses, saved chapters, and suspension", () => {
    const journey = deriveAuthoringJourney(
      seed({
        artifacts: { outlineReady: true, savedChapters: 2, wordCount: 1900 },
        access: { suspended: true },
        run: run({
          databaseStatus: "awaiting_input",
          effectiveStatus: "awaiting_input",
          stage: "awaiting_credits",
          cancellationRequestedAt: NOW,
          pause: {
            kind: "credits",
            version: 2,
            balanceCredits: 0,
            requiredCredits: 4,
          },
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction).toMatchObject({
      kind: "finish_cancellation",
      href: `/projects/${PROJECT_ID}/write#production-status`,
      requiresMeteredAccess: false,
    });
    expect(journey.nextAction.label).toMatch(/safe stop/i);
  });

  it("does not leave an author in stopping safely after cancellation is terminal", () => {
    const journey = deriveAuthoringJourney(
      seed({
        artifacts: { savedChapters: 2, wordCount: 1900 },
        run: run({
          databaseStatus: "cancelled",
          workflowStatus: "cancelled",
          effectiveStatus: "cancelled",
          stage: "cancelled",
          cancellationRequestedAt: NOW,
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("recover_saved_work");
    expect(journey.nextAction.kind).not.toBe("finish_cancellation");
  });

  it("does not guess at an unversioned or invalid durable input request", () => {
    const journey = deriveAuthoringJourney(
      seed({
        run: run({
          databaseStatus: "awaiting_input",
          effectiveStatus: "awaiting_input",
          stage: "chapters",
          pause: null,
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("contact_support");
    expect(journey.nextAction.description).toMatch(/does not identify a safe response/i);
  });

  it("keeps a healthy active run authoritative even when editable chapters already exist", () => {
    const journey = deriveAuthoringJourney(
      seed({
        artifacts: { savedChapters: 2, wordCount: 1900 },
        run: run({
          stage: "editing",
          progressPct: 74,
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("watch_production");
    expect(journey.phase).toBe("refine");
  });

  it.each(["chapter", "edit_pass", "continuity"] as const)(
    "keeps an active %s mutation in the editor instead of advertising read or export",
    (kind) => {
      const journey = deriveAuthoringJourney(
        seed({
          project: { completedAt: NOW },
          artifacts: { savedChapters: 3, finalChapters: 3, wordCount: 3000 },
          run: run({ kind, stage: kind === "continuity" ? "continuity" : "editing" }),
        }),
      );

      expect(journey.nextAction.kind).toBe("watch_production");
      expect(journey.nextAction.href).toBe(
        `/projects/${PROJECT_ID}/editor#editor-production-status`,
      );
      if (kind === "edit_pass") {
        expect(journey.nextAction.label).toMatch(/manuscript review/i);
        expect(journey.nextAction.description).toMatch(/chapter-by-chapter review/i);
      }
    },
  );

  it("returns an interrupted manuscript review to its saved suggestions without an upsell", () => {
    const journey = deriveAuthoringJourney(
      seed({
        artifacts: { savedChapters: 3, wordCount: 3_000 },
        run: run({
          kind: "edit_pass",
          databaseStatus: "failed",
          workflowStatus: "failed",
          effectiveStatus: "failed",
          stage: "failed",
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction).toMatchObject({
      kind: "edit_manuscript",
      href: `/projects/${PROJECT_ID}/editor`,
      label: "Review saved suggestions",
    });
    expect(journey.nextAction.description).toMatch(/without overwriting your prose/i);
    expect(journey.purchaseAction).toBeNull();
  });

  it.each(["chapter", "edit_pass", "continuity"] as const)(
    "lets a completed %s mutation fall through to the saved-manuscript action",
    (kind) => {
      const journey = deriveAuthoringJourney(
        seed({
          project: { completedAt: NOW },
          artifacts: {
            savedChapters: 3,
            editedChapters: 2,
            finalChapters: 1,
            wordCount: 3000,
          },
          run: run({
            kind,
            databaseStatus: "completed",
            workflowStatus: "completed",
            effectiveStatus: "completed",
            stage: "done",
            progressPct: 100,
            completionArtifactsReady: false,
            completedAt: NOW,
            health: "complete",
          }),
        }),
      );

      expect(journey.nextAction).toMatchObject({
        kind: "edit_manuscript",
        href: `/projects/${PROJECT_ID}/editor`,
      });
      expect(journey.purchaseAction).toBeNull();
    },
  );

  it("keeps full-length continuation after a completed scoped mutation", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { completedAt: NOW },
        artifacts: {
          fullBookCompletionReady: true,
          savedChapters: 3,
          editedChapters: 3,
          finalChapters: 3,
          wordCount: 3000,
        },
        run: run({
          kind: "edit_pass",
          databaseStatus: "completed",
          workflowStatus: "completed",
          effectiveStatus: "completed",
          stage: "done",
          progressPct: 100,
          completionArtifactsReady: false,
          completedAt: NOW,
          health: "complete",
        }),
      }),
    );

    expect(journey.nextAction).toMatchObject({
      kind: "read_or_export",
      href: `/projects/${PROJECT_ID}/manuscript#manuscript-actions`,
    });
    expect(journey.purchaseAction).toMatchObject({
      kind: "unlock_full_book",
      href: `/studio/credits?return=${encodeURIComponent(`/studio/new?from=${PROJECT_ID}`)}`,
      label: "Continue this story at full length",
    });
  });

  it("preserves a completed manuscript after the author restructures its chapters", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { completedAt: NOW },
        artifacts: {
          fullBookCompletionReady: true,
          savedChapters: 4,
          editedChapters: 0,
          finalChapters: 0,
          totalChapters: 4,
          wordCount: 3000,
        },
        run: run({
          kind: "full_book",
          databaseStatus: "completed",
          workflowStatus: "completed",
          effectiveStatus: "completed",
          stage: "done",
          progressPct: 100,
          completionArtifactsReady: true,
          completedAt: NOW,
          health: "complete",
        }),
      }),
    );

    expect(journey.nextAction).toMatchObject({
      kind: "read_or_export",
      href: `/projects/${PROJECT_ID}/manuscript#manuscript-actions`,
    });
    expect(journey.purchaseAction).toMatchObject({
      kind: "unlock_full_book",
      label: "Continue this story at full length",
    });
  });

  it("still escalates a reported completion without durable completion proof", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { completedAt: NOW },
        artifacts: {
          fullBookCompletionReady: false,
          savedChapters: 3,
          finalChapters: 3,
          totalChapters: 3,
        },
        run: run({
          kind: "full_book",
          databaseStatus: "completed",
          workflowStatus: "completed",
          effectiveStatus: "completed",
          stage: "done",
          progressPct: 100,
          completionArtifactsReady: false,
          completedAt: NOW,
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("contact_support");
    expect(journey.purchaseAction).toBeNull();
  });

  it("sends an already-unlocked included story directly to carried-over setup", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { completedAt: NOW },
        access: { fullBookUnlocked: true },
        artifacts: {
          fullBookCompletionReady: true,
          savedChapters: 3,
          editedChapters: 3,
          finalChapters: 3,
          wordCount: 3000,
        },
        run: run({
          kind: "edit_pass",
          databaseStatus: "completed",
          workflowStatus: "completed",
          effectiveStatus: "completed",
          stage: "done",
          progressPct: 100,
          completionArtifactsReady: false,
          completedAt: NOW,
          health: "complete",
        }),
      }),
    );

    expect(journey.purchaseAction).toMatchObject({
      href: `/studio/new?from=${PROJECT_ID}`,
      label: "Continue this story at full length",
    });
    expect(journey.purchaseAction?.href).not.toContain("/studio/credits");
  });

  it("never turns a locked legacy failure into a purchase remedy", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { experience: "full_book" },
        run: run({
          databaseStatus: "failed",
          workflowStatus: "failed",
          effectiveStatus: "failed",
          stage: "failed",
          noWorkStarted: true,
          authoringBegan: false,
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("contact_support");
    expect(journey.nextAction.description).toMatch(/purchase is not required/i);
    expect(journey.purchaseAction).toBeNull();
  });

  it("does not let denormalized project status replace the artifact-derived next step", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { status: "complete", completedAt: null },
      }),
    );

    expect(journey.nextAction.kind).toBe("start_production");
    expect(journey.nextAction.href).toBe(`/projects/${PROJECT_ID}/write`);
  });

  it("withholds the included-story conversion when completion artifacts contradict the run", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { status: "complete", completedAt: NOW },
        artifacts: { savedChapters: 3, finalChapters: 3, wordCount: 3000 },
        run: run({
          databaseStatus: "completed",
          workflowStatus: "completed",
          effectiveStatus: "completed",
          stage: "done",
          progressPct: 100,
          completionArtifactsReady: false,
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction.kind).toBe("contact_support");
    expect(journey.purchaseAction).toBeNull();
  });

  it("routes a database-normalized completion contradiction to support before generic recovery", () => {
    const journey = deriveAuthoringJourney(
      seed({
        project: { status: "complete", completedAt: NOW },
        artifacts: { savedChapters: 1, finalChapters: 1, wordCount: 1000 },
        run: run({
          databaseStatus: "completed",
          workflowStatus: "completed",
          effectiveStatus: "failed",
          stage: "done",
          progressPct: 100,
          completionArtifactsReady: false,
          health: "needs_attention",
        }),
      }),
    );

    expect(journey.nextAction).toMatchObject({
      kind: "contact_support",
      label: "Contact support",
    });
    expect(journey.purchaseAction).toBeNull();
  });
});

describe("authoringJourneyWithProgress", () => {
  it("does not synthesize completion or final artifacts from a streamed done event", () => {
    const initial = deriveAuthoringJourney(seed({ run: run() }));
    const completed = authoringJourneyWithProgress(initial, {
      runId: RUN_ID,
      stage: "done",
      pct: 100,
      draftedCount: 3,
      totalChapters: 3,
    });

    expect(completed.nextAction).toEqual(initial.nextAction);
    expect(completed.artifacts).toEqual(initial.artifacts);
    expect(completed.run).toMatchObject({
      stage: "done",
      progressPct: 100,
      databaseStatus: "running",
      effectiveStatus: "running",
    });
    expect(completed.run?.completionArtifactsReady).toBeUndefined();
    expect(completed.project.status).toBe("draft");
    expect(completed.purchaseAction).toBeNull();
  });

  it("advances the shared next action to outline review", () => {
    const initial = deriveAuthoringJourney(seed({ run: run({ stage: "outline" }) }));
    const paused = authoringJourneyWithProgress(initial, {
      runId: RUN_ID,
      stage: "awaiting_approval",
      pct: 18,
      draftedCount: 0,
      totalChapters: 3,
    });

    expect(paused.nextAction.kind).toBe("review_outline");
    expect(paused.nextAction.href).toBe(`/projects/${PROJECT_ID}/outline`);
  });

  it("advances every shared surface to stopping safely after cancellation is accepted", () => {
    const initial = deriveAuthoringJourney(seed({ run: run({ stage: "chapters" }) }));
    expect(initial.nextAction.kind).toBe("watch_production");

    const stopping = authoringJourneyWithProgress(initial, {
      runId: RUN_ID,
      stage: "chapters",
      pct: 42,
      cancellationRequestedAt: NOW,
      draftedCount: 1,
      totalChapters: 3,
    });

    expect(stopping.run?.cancellationRequestedAt).toBe(NOW);
    expect(stopping.nextAction).toMatchObject({
      kind: "finish_cancellation",
      label: "View the safe stop",
      href: `/projects/${PROJECT_ID}/write#production-status`,
    });
  });

  it("replaces a failed run with a distinct active recovery run without inheriting failure state", () => {
    const interrupted = deriveAuthoringJourney(
      seed({
        artifacts: { savedChapters: 2, savedCheckpoints: 4, wordCount: 1900 },
        run: run({
          databaseStatus: "failed",
          workflowStatus: "failed",
          effectiveStatus: "failed",
          stage: "failed",
          progressPct: 58,
          completedAt: NOW,
          rootErrorCode: "provider_failure",
          rootErrorStage: "chapters",
          health: "needs_attention",
        }),
      }),
    );
    expect(interrupted.nextAction.kind).toBe("recover_saved_work");

    const resumed = authoringJourneyWithProgress(interrupted, {
      runId: RESUMED_RUN_ID,
      stage: "concept",
      pct: 2,
      detail: "Developing the premise",
      draftedCount: 2,
      totalChapters: 3,
    });

    expect(resumed.run).toMatchObject({
      id: RESUMED_RUN_ID,
      kind: "full_book",
      databaseStatus: "running",
      workflowStatus: null,
      effectiveStatus: "running",
      stage: "concept",
      progressPct: 2,
      completedAt: null,
      rootErrorCode: undefined,
      rootErrorStage: undefined,
      cancellationRequestedAt: undefined,
      pause: null,
    });
    expect(resumed.nextAction).toMatchObject({
      kind: "watch_production",
      label: "Watch production",
      href: `/projects/${PROJECT_ID}/write#production-status`,
    });
  });

  it("does not revive a terminal run from stale same-run progress", () => {
    const interrupted = deriveAuthoringJourney(
      seed({
        artifacts: { savedChapters: 2, savedCheckpoints: 4, wordCount: 1900 },
        run: run({
          databaseStatus: "failed",
          workflowStatus: "failed",
          effectiveStatus: "failed",
          stage: "failed",
          progressPct: 58,
          completedAt: NOW,
          rootErrorCode: "provider_failure",
          rootErrorStage: "chapters",
          health: "needs_attention",
        }),
      }),
    );

    const stale = authoringJourneyWithProgress(interrupted, {
      runId: RUN_ID,
      stage: "concept",
      pct: 2,
      detail: "Developing the premise",
      draftedCount: 2,
      totalChapters: 3,
    });

    expect(stale).toBe(interrupted);
    expect(stale.run).toMatchObject({
      id: RUN_ID,
      databaseStatus: "failed",
      effectiveStatus: "failed",
      stage: "failed",
      rootErrorCode: "provider_failure",
    });
    expect(stale.nextAction.kind).toBe("recover_saved_work");
  });

  it("does not let a distinct live progress record displace an authoritative active run", () => {
    const active = deriveAuthoringJourney(seed({ run: run() }));
    const conflicting = authoringJourneyWithProgress(active, {
      runId: RESUMED_RUN_ID,
      stage: "concept",
      pct: 2,
      draftedCount: 0,
      totalChapters: 3,
    });

    expect(conflicting).toBe(active);
    expect(conflicting.run?.id).toBe(RUN_ID);
    expect(conflicting.run?.stage).toBe("chapters");
  });
});

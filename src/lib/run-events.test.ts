import { describe, expect, it } from "vitest";

import {
  nextGenerationPreparationAction,
  generationBillingScope,
  OUTLINE_REVISION_RESERVATION_KEY,
  rebaseGenerationStartState,
  retryRunFromSavedWork,
  severResumeBillingLineage,
  latestResumableRunId,
  resumableRunId,
  runEventSchema,
  sameGenerationShape,
  stageSchema,
  stagedArtifactsMatch,
} from "./run-events";
import type { BookConcept, BookOutline } from "@/ai/schemas";

describe("generation run events", () => {
  it("treats story-bible construction as a first-class stage", () => {
    expect(stageSchema.parse("bible")).toBe("bible");
    expect(
      runEventSchema.parse({
        type: "stage",
        stage: "bible",
        pct: 13,
        detail: "Building shared canon",
      }),
    ).toEqual({
      type: "stage",
      stage: "bible",
      pct: 13,
      detail: "Building shared canon",
    });
  });

  it("treats the creative-direction pause as a first-class stage", () => {
    expect(stageSchema.parse("awaiting_guidance")).toBe("awaiting_guidance");
    expect(
      runEventSchema.parse({
        type: "stage",
        stage: "awaiting_guidance",
        pct: 6,
        detail: "Choose the direction that should shape the chapter plan",
      }),
    ).toMatchObject({ stage: "awaiting_guidance", pct: 6 });
  });

  it("preserves the concrete phase behind a credit pause", () => {
    expect(
      runEventSchema.parse({
        type: "stage",
        stage: "awaiting_credits",
        pct: 85,
        detail: "Credits needed to continue review",
        resumeStage: "continuity",
      }),
    ).toMatchObject({ stage: "awaiting_credits", resumeStage: "continuity" });
  });
});

describe("generation retry boundaries", () => {
  const next = {
    tier: "standard" as const,
    requireOutlineApproval: false,
    waveSize: 4,
    targetChapters: 12,
    targetWordsPerChapter: 3_000,
    inputSnapshot: {
      brief: "A cartographer follows a disappearing road.",
      genre: "Fantasy",
      styleGuide: "Lyrical but precise.",
      voiceProfile: "immersive",
      pov: "third_limited" as const,
      tense: "past" as const,
      tone: "wondrous",
      styleProfile: null,
      heatLevel: "none" as const,
      violenceLevel: "mild" as const,
      profanity: "none" as const,
      avoidTopics: [],
    },
  };
  const matchingConfig = { ...next, manuscriptPrepared: true };

  it("preserves work only for failed or cancelled runs with the same frozen input", () => {
    expect(
      resumableRunId(next, { id: "failed-run", status: "failed", config: matchingConfig }),
    ).toBe("failed-run");
    expect(
      resumableRunId(next, {
        id: "cancelled-run",
        status: "cancelled",
        config: matchingConfig,
      }),
    ).toBe("cancelled-run");
    expect(
      resumableRunId(next, { id: "completed-run", status: "completed", config: matchingConfig }),
    ).toBeUndefined();
  });

  it("starts fresh when production shape or approval behavior changes", () => {
    expect(sameGenerationShape(next, matchingConfig)).toBe(true);
    for (const config of [
      { ...matchingConfig, targetChapters: 14 },
      { ...matchingConfig, targetWordsPerChapter: 2_000 },
      { ...matchingConfig, tier: "premium" as const },
      { ...matchingConfig, requireOutlineApproval: true },
      { ...matchingConfig, waveSize: 2 },
    ]) {
      expect(resumableRunId(next, { id: "old-run", status: "failed", config })).toBeUndefined();
    }
  });

  it("keeps pinned protocols isolated from guided protocol-v3 retries", () => {
    const guided = {
      ...next,
      protocolVersion: 3 as const,
      interaction: { mode: "guided" as const, maxQuestions: 1 as const },
    };
    expect(sameGenerationShape(guided, { ...matchingConfig, protocolVersion: 2 })).toBe(false);
    expect(
      sameGenerationShape(guided, {
        ...matchingConfig,
        protocolVersion: 3,
        interaction: { mode: "guided", maxQuestions: 1 },
      }),
    ).toBe(true);
    expect(sameGenerationShape(next, matchingConfig)).toBe(true);
  });

  it("reattaches exact-input guided work before manuscript preparation without exposing manuscript checkpoints", () => {
    const guided = {
      ...next,
      protocolVersion: 3 as const,
      interaction: { mode: "guided" as const, maxQuestions: 1 as const },
    };
    const interrupted = {
      ...guided,
      stagedConcept: { title: "The Disappearing Road" } as BookConcept,
      creativeDecisions: {
        afterConcept: {
          questionId: "11111111-1111-4111-8111-111111111111",
          questionKey: "after_concept" as const,
          mode: "option" as const,
          selectedOptionId: "option-2",
          answer: "Follow the road into the drowned archive.",
        },
      },
      work: {
        conceptExpanded: { title: "The Disappearing Road" } as BookConcept,
        chapters: { "1": { draft: "Never inherit this before preparation." } },
      },
      completion: {
        chapterSummaries: {
          "1": { sourceRunId: "guided-source", contentDigest: "unsafe-manuscript-digest" },
        },
      },
    };

    expect(
      retryRunFromSavedWork(guided, {
        id: "guided-source",
        status: "failed",
        config: interrupted,
      }),
    ).toBe("guided-source");
    expect(
      resumableRunId(guided, {
        id: "guided-source",
        status: "failed",
        config: interrupted,
      }),
    ).toBeUndefined();
    expect(
      latestResumableRunId(guided, [
        { id: "guided-source", status: "failed", config: interrupted },
      ]),
    ).toBe("guided-source");
  });

  it("rejects pre-manuscript guided work after any frozen-input change", () => {
    const guided = {
      ...next,
      protocolVersion: 3 as const,
      interaction: { mode: "guided" as const, maxQuestions: 1 as const },
    };
    const interrupted = {
      ...guided,
      inputSnapshot: { ...guided.inputSnapshot, brief: "The old brief." },
      stagedConcept: { title: "Old concept" } as BookConcept,
      creativeDecisions: {
        afterConcept: {
          questionId: "11111111-1111-4111-8111-111111111111",
          questionKey: "after_concept" as const,
          mode: "custom" as const,
          selectedOptionId: null,
          answer: "An old answer that must not shape the changed story.",
        },
      },
    };
    expect(
      retryRunFromSavedWork(guided, {
        id: "changed-input-source",
        status: "failed",
        config: interrupted,
      }),
    ).toBeUndefined();
  });

  it("does not broaden pre-manuscript reuse to autopilot or empty guided attempts", () => {
    const autopilot = {
      ...next,
      protocolVersion: 3 as const,
      interaction: { mode: "autopilot" as const, maxQuestions: 0 as const },
    };
    expect(
      retryRunFromSavedWork(autopilot, {
        id: "autopilot-source",
        status: "failed",
        config: {
          ...autopilot,
          stagedConcept: { title: "Autopilot concept" } as BookConcept,
        },
      }),
    ).toBeUndefined();
    const guided = {
      ...next,
      protocolVersion: 3 as const,
      interaction: { mode: "guided" as const, maxQuestions: 1 as const },
    };
    expect(
      retryRunFromSavedWork(guided, {
        id: "empty-guided-source",
        status: "failed",
        config: guided,
      }),
    ).toBeUndefined();
  });

  it("never reuses full-book artifacts for an included story", () => {
    expect(
      resumableRunId(
        { ...next, productionMode: "trial_short_story" },
        {
          id: "full-book-run",
          status: "failed",
          config: { ...matchingConfig, productionMode: "full_book" },
        },
      ),
    ).toBeUndefined();
    expect(sameGenerationShape({ ...next, productionMode: "full_book" }, matchingConfig)).toBe(
      true,
    );
  });

  it("starts fresh when chapter add, delete, or move changes the prepared topology", () => {
    const withTopology = {
      ...next,
      chapterTopologyFingerprint: "topology-after-author-edit",
    };
    expect(
      resumableRunId(withTopology, {
        id: "failed-run",
        status: "failed",
        config: {
          ...matchingConfig,
          chapterTopologyFingerprint: "topology-at-preparation",
        },
      }),
    ).toBeUndefined();
  });

  it.each([
    ["workingTitle", "A Different Working Title"],
    ["brief", "A diver discovers a city beneath the ice."],
    ["genre", "Mystery"],
    ["styleGuide", "Short declarative sentences."],
    ["voiceProfile", "cinematic"],
    ["pov", "first"],
    ["tense", "present"],
    ["tone", "comic"],
    ["styleProfile", "literary"],
    ["heatLevel", "mild"],
    ["violenceLevel", "graphic"],
    ["profanity", "strong"],
    ["avoidTopics", ["animal harm"]],
  ] as const)("starts fresh when the frozen %s changes", (field, value) => {
    const config = {
      ...matchingConfig,
      inputSnapshot: { ...matchingConfig.inputSnapshot, [field]: value },
    };
    expect(resumableRunId(next, { id: "old-run", status: "failed", config })).toBeUndefined();
  });

  it("does not reuse legacy runs that lack a complete input snapshot", () => {
    const legacyConfig = {
      tier: matchingConfig.tier,
      requireOutlineApproval: matchingConfig.requireOutlineApproval,
      waveSize: matchingConfig.waveSize,
      targetChapters: matchingConfig.targetChapters,
      targetWordsPerChapter: matchingConfig.targetWordsPerChapter,
    };
    expect(
      resumableRunId(next, { id: "legacy-run", status: "failed", config: legacyConfig }),
    ).toBeUndefined();
  });

  it("treats a newer incompatible attempt as a barrier to older checkpoints", () => {
    expect(
      latestResumableRunId(next, [
        {
          id: "newest-changed-shape",
          status: "failed",
          config: { ...matchingConfig, targetChapters: 20 },
        },
        {
          id: "older-compatible",
          status: "failed",
          config: matchingConfig,
        },
      ]),
    ).toBeUndefined();
  });

  it("starts fresh when the latest persisted outline changed after failure", () => {
    expect(
      resumableRunId(
        { ...next, liveOutlineFingerprint: "latest-user-outline" },
        {
          id: "failed-run",
          status: "failed",
          config: {
            ...matchingConfig,
            liveOutlineFingerprint: "outline-at-failure",
          },
        },
      ),
    ).toBeUndefined();
  });

  it("keeps compatible retry scopes but gives revised artifacts a new billing root", () => {
    const compatible = { ...matchingConfig, billingLineageRunId: "original-run" };
    expect(generationBillingScope(compatible, "retry-run", "entity-bible")).toBe(
      "generation:original-run:entity-bible",
    );
    const invalidated = { ...compatible, billingLineageRunId: "retry-run" };
    for (const scope of [
      "entity-bible",
      "chapter:1:writer",
      "chapter:1:editorial",
      "continuity:plot",
    ]) {
      expect(generationBillingScope(invalidated, "retry-run", scope)).toBe(
        `generation:retry-run:${scope}`,
      );
    }
  });

  it("severs a resumed outline before same-note revision scopes are derived", () => {
    const source = {
      ...matchingConfig,
      resumeFromRunId: "source-a",
      billingLineageRunId: "source-a",
      work: {
        conceptExpanded: { title: "Kept concept" } as BookConcept,
        outline: { revisionNotes: "Make the ending quieter." },
      },
    };
    const revised = severResumeBillingLineage(source, "source-b");

    expect(revised.resumeFromRunId).toBeUndefined();
    expect(revised.billingLineageRunId).toBe("source-b");
    expect(revised.work?.conceptExpanded).toEqual(source.work.conceptExpanded);
    expect(revised.work?.outline).toBeUndefined();
    const sameNoteScope = "outline:7f65f9a0f01a7a2b";
    expect(generationBillingScope(source, "source-b", sameNoteScope)).toBe(
      `generation:source-a:${sameNoteScope}`,
    );
    expect(generationBillingScope(revised, "source-b", sameNoteScope)).toBe(
      `generation:source-b:${sameNoteScope}`,
    );
  });

  it("never puts long author revision notes into the indexed reservation key", () => {
    const notes = "Please preserve this private family detail. ".repeat(250);
    expect(OUTLINE_REVISION_RESERVATION_KEY).toBe("outline-revision");
    expect(OUTLINE_REVISION_RESERVATION_KEY).not.toContain(notes.slice(0, 20));
    expect(OUTLINE_REVISION_RESERVATION_KEY.length).toBeLessThan(64);
  });

  it("drops stale retry lineage when a structural edit wins before the locked start", () => {
    const stale = {
      ...matchingConfig,
      chapterTopologyFingerprint: "before-edit",
      liveOutlineFingerprint: "before-outline-edit",
      resumeFromRunId: "failed-run",
      billingLineageRunId: "original-run",
    };
    expect(
      rebaseGenerationStartState(stale, {
        ...next,
        chapterTopologyFingerprint: "after-edit",
        liveOutlineFingerprint: "after-outline-edit",
      }),
    ).toMatchObject({
      chapterTopologyFingerprint: "after-edit",
      liveOutlineFingerprint: "after-outline-edit",
      resumeFromRunId: undefined,
      billingLineageRunId: undefined,
    });
  });

  it("uses chapter and word settings that committed before the authoritative start", () => {
    const stale = {
      ...matchingConfig,
      targetChapters: 8,
      targetWordsPerChapter: 1_800,
      resumeFromRunId: "failed-run",
      billingLineageRunId: "original-run",
    };
    const locked = {
      ...matchingConfig,
      targetChapters: 14,
      targetWordsPerChapter: 3_200,
    };
    expect(rebaseGenerationStartState(stale, locked)).toMatchObject({
      targetChapters: 14,
      targetWordsPerChapter: 3_200,
      resumeFromRunId: undefined,
      billingLineageRunId: undefined,
    });
  });

  it("starts a new run after failure before the preparation boundary", () => {
    expect(
      resumableRunId(next, {
        id: "preparation-not-started",
        status: "failed",
        config: {
          ...next,
          preparation: {},
          manuscriptPrepared: false,
        },
      }),
    ).toBeUndefined();
  });

  it("starts a new run after a failure partway through preparation", () => {
    expect(
      resumableRunId(next, {
        id: "partially-prepared",
        status: "failed",
        config: {
          ...next,
          preparation: { manuscriptReset: true, conceptPersisted: true },
        },
      }),
    ).toBeUndefined();
  });

  it("uses the newest compatible attempt so a retry chain keeps later checkpoints", () => {
    expect(
      resumableRunId(next, {
        id: "second-attempt",
        status: "failed",
        config: { ...matchingConfig, resumeFromRunId: "original-attempt" },
      }),
    ).toBe("second-attempt");
  });
});

describe("generation preparation checkpoints", () => {
  it.each([
    [{}, "reset_manuscript"],
    [{ preparation: { manuscriptReset: true as const } }, "reset_entity_canon"],
    [
      {
        preparation: {
          manuscriptReset: true as const,
          entityCanonReset: true as const,
        },
      },
      "persist_concept",
    ],
    [
      {
        preparation: {
          manuscriptReset: true as const,
          entityCanonReset: true as const,
          conceptPersisted: true as const,
        },
      },
      "persist_outline",
    ],
    [
      {
        preparation: {
          manuscriptReset: true as const,
          entityCanonReset: true as const,
          conceptPersisted: true as const,
          outlinePersisted: true as const,
        },
      },
      "mark_prepared",
    ],
    [{ manuscriptPrepared: true }, "complete"],
  ] as const)("continues from the first incomplete durable action", (config, expected) => {
    expect(nextGenerationPreparationAction(config)).toBe(expected);
  });

  it("does not reuse a prepared source after the current run revises its staged outline", () => {
    const concept = { title: "The River Door" } as BookConcept;
    const sourceOutline = {
      chapters: [{ number: 1, title: "The Map" }],
    } as BookOutline;
    const revisedOutline = {
      chapters: [{ number: 1, title: "The Door" }],
    } as BookOutline;

    expect(
      stagedArtifactsMatch(
        { stagedConcept: concept, stagedOutline: sourceOutline },
        { stagedConcept: concept, stagedOutline: sourceOutline },
      ),
    ).toBe(true);
    expect(
      stagedArtifactsMatch(
        { stagedConcept: concept, stagedOutline: revisedOutline },
        { stagedConcept: concept, stagedOutline: sourceOutline },
      ),
    ).toBe(false);
  });
});

describe("notice events", () => {
  it("carries a skipped quality pass without terminalizing the run", () => {
    // Deliberately not an `error` event: persistRunEvent forces
    // current_stage='failed' for every error and ignores its `fatal` flag, so
    // reusing `error` here would fail the very run that is about to complete.
    const parsed = runEventSchema.safeParse({
      type: "notice",
      code: "continuity_review_unavailable",
      message: "We couldn't complete the consistency review, so your book was finished without it.",
      stage: "continuity",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a notice with no stage", () => {
    expect(
      runEventSchema.safeParse({
        type: "notice",
        code: "editorial_pass_incomplete",
        message: "We couldn't finish the editing pass on every chapter.",
      }).success,
    ).toBe(true);
  });

  it("bounds the message so provider or manuscript text cannot ride along", () => {
    // The whole point of the cap: an unbounded message is how raw model output
    // reaches the author's screen and the durable event log.
    expect(
      runEventSchema.safeParse({
        type: "notice",
        code: "continuity_review_unavailable",
        message: "x".repeat(301),
      }).success,
    ).toBe(false);
    expect(
      runEventSchema.safeParse({
        type: "notice",
        code: "y".repeat(65),
        message: "short",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown stage", () => {
    expect(
      runEventSchema.safeParse({
        type: "notice",
        code: "continuity_review_unavailable",
        message: "short",
        stage: "not_a_stage",
      }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { parseRunHealthResponse, type RunHealth } from "./use-run-stream";

const previous: RunHealth = {
  databaseStatus: "queued",
  effectiveStatus: "queued",
  noWorkStarted: true,
  acceptedAt: "2026-07-30T19:22:27.000Z",
  estimatedMinutes: 12,
};

describe("parseRunHealthResponse", () => {
  it("adapts the enriched status response used while live notes reconnect", () => {
    expect(
      parseRunHealthResponse(
        {
          run: {
            status: "running",
            error: null,
            createdAt: "2026-07-30T19:22:27.000Z",
            startedAt: "2026-07-30T19:22:30.000Z",
          },
          health: {
            databaseStatus: "running",
            workflowStatus: "running",
            effectiveStatus: "running",
            stage: "chapters",
            progressPct: 46,
            stageDescription: "Drafting chapter 2",
            lastUpdateAt: "2026-07-30T19:29:00.000Z",
            noWorkStarted: false,
            chapters: {
              total: 3,
              planned: 1,
              drafting: 1,
              drafted: 1,
              edited: 0,
              final: 0,
            },
            spend: { meteredUsd: 0.21, creditsUsed: 0.6 },
          },
        },
        previous,
      ),
    ).toMatchObject({
      health: {
        databaseStatus: "running",
        workflowStatus: "running",
        effectiveStatus: "running",
        noWorkStarted: false,
        lastEventAt: "2026-07-30T19:29:00.000Z",
        estimatedMinutes: 12,
        chapters: { total: 3, drafting: 1, drafted: 1 },
      },
      stage: "chapters",
      pct: 46,
      detail: "Drafting chapter 2",
      totalUsd: 0.21,
      totalCredits: 0.6,
    });
  });

  it("recognizes an out-of-band terminal workflow reconciliation", () => {
    expect(
      parseRunHealthResponse(
        {
          run: { status: "failed", error: "Production could not start." },
          health: {
            databaseStatus: "failed",
            workflowStatus: "failed",
            effectiveStatus: "failed",
            noWorkStarted: true,
            completedAt: "2026-07-30T19:22:39.000Z",
          },
        },
        previous,
      ),
    ).toMatchObject({
      health: {
        databaseStatus: "failed",
        workflowStatus: "failed",
        effectiveStatus: "failed",
        noWorkStarted: true,
      },
      error: "Production could not start.",
    });
  });

  it("carries server-validated completion artifact proof into live health", () => {
    expect(
      parseRunHealthResponse(
        {
          run: { status: "completed", error: null },
          health: {
            databaseStatus: "completed",
            workflowStatus: "completed",
            effectiveStatus: "completed",
            completionArtifactsReady: true,
            noWorkStarted: false,
            stage: "done",
            progressPct: 100,
          },
        },
        previous,
      ),
    ).toMatchObject({
      health: {
        effectiveStatus: "completed",
        completionArtifactsReady: true,
      },
      stage: "done",
      pct: 100,
    });
  });

  it("uses the registered creative pause even before its stage event arrives", () => {
    const question = {
      id: "11111111-1111-4111-8111-111111111111",
      questionKey: "after_concept",
      question: "What should pull Mara beyond the lighthouse?",
      rationale: "This choice shapes the chapter plan.",
      options: [
        { id: "option-1", label: "Family", description: "She searches for her brother." },
        { id: "option-2", label: "Duty", description: "She carries a warning inland." },
        { id: "option-3", label: "Wonder", description: "She follows an impossible map." },
      ],
      recommendedOptionId: "option-2",
      decisionDigest: "a".repeat(64),
    };
    expect(
      parseRunHealthResponse(
        {
          run: { status: "awaiting_input", error: null },
          health: {
            databaseStatus: "awaiting_input",
            effectiveStatus: "awaiting_input",
            stage: "concept",
            progressPct: 6,
            noWorkStarted: false,
            pause: {
              kind: "creative_decision",
              version: 1,
              registeredAt: "2026-08-02T20:00:00.000Z",
              details: { questionId: question.id, resumeStage: "outline" },
            },
            question,
          },
        },
        previous,
      ),
    ).toMatchObject({
      stage: "awaiting_guidance",
      pct: 6,
      health: {
        pause: { kind: "creative_decision" },
        question: { id: question.id },
      },
    });
  });

  it("surfaces a safe ambiguous-start retry and recognizes the later durable Workflow link", () => {
    const uncertain = parseRunHealthResponse(
      {
        run: { status: "queued", workflowRunId: null },
        health: {
          databaseStatus: "queued",
          effectiveStatus: "queued",
          noWorkStarted: true,
          acceptanceUncertain: true,
          safeToRetry: true,
        },
      },
      previous,
    );
    expect(uncertain).toMatchObject({
      health: {
        acceptanceUncertain: true,
        safeToRetry: true,
        handoffConfirmed: false,
      },
    });

    expect(
      parseRunHealthResponse(
        {
          run: { status: "queued", workflowRunId: "wrun_01KYT7MRBV6AT2H52XXPA4GK09" },
          health: {
            databaseStatus: "queued",
            workflowStatus: "pending",
            effectiveStatus: "queued",
            noWorkStarted: true,
            acceptanceUncertain: false,
            safeToRetry: false,
          },
        },
        uncertain!.health,
      ),
    ).toMatchObject({
      health: {
        acceptanceUncertain: false,
        safeToRetry: false,
        handoffConfirmed: true,
      },
    });
  });

  it("keeps the last known health when optional rollout fields are malformed", () => {
    expect(
      parseRunHealthResponse(
        {
          run: { status: "unknown" },
          health: {
            workflowStatus: "maybe",
            progressPct: "half",
            noWorkStarted: "no",
          },
        },
        previous,
      ),
    ).toMatchObject({ health: previous });
  });
});

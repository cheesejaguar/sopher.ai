// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RecoveryCard } from "./run-viewer";
import type { RunStreamState } from "@/hooks/use-run-stream";

const RUN_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

/** The 2026-08-04 run: every chapter written and edited, then continuity failed. */
function failedState(health: Partial<RunStreamState["health"]> = {}): RunStreamState {
  return {
    stage: "failed",
    pct: 96,
    chapters: new Map(),
    agentFeed: [],
    totalUsd: 3.4,
    totalCredits: 10.74,
    connection: "ended",
    connectionAttempt: 0,
    notices: [],
    error: {
      message:
        "continuity.narrative_structure ended before a complete result was available (finish reason: stop; 3742 output tokens).",
      fatal: true,
    },
    health: {
      databaseStatus: "failed",
      effectiveStatus: "failed",
      noWorkStarted: false,
      savedChapterCount: 12,
      savedCheckpointCount: 41,
      supportReference: "SPH-11111111-22222222",
      rootErrorCode: "provider_output_invalid",
      rootErrorStage: "continuity",
      ...health,
    },
  };
}

function renderCard(state: RunStreamState) {
  return render(
    <RecoveryCard
      runId={RUN_ID}
      projectId={PROJECT_ID}
      state={state}
      savedChapterCount={12}
      cancelled={false}
      nextAction={null}
      pending={false}
      error={null}
    />,
  );
}

afterEach(cleanup);

describe("RecoveryCard", () => {
  it("tells the author the cause in plain language instead of the operator message", () => {
    renderCard(failedState());

    expect(
      screen.getByText(
        "The Studio could not read the answer it got back during the final read-through for continuity.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/finish reason/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/output tokens/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/provider_output_invalid/)).not.toBeInTheDocument();
  });

  it("says what was preserved, whether to retry, and what to do next", () => {
    renderCard(failedState());

    expect(screen.getByText(/All 12 chapters written so far are saved and safe\./)).toBeVisible();
    expect(screen.getByText(/would end the same way/i)).toBeVisible();
    expect(screen.getByText(/send us the support reference below/i)).toBeVisible();
    expect(screen.getByText("Support checks the failed step first")).toBeVisible();
  });

  it("always offers a support reference, falling back to the run id", () => {
    renderCard(failedState());
    expect(screen.getByText(/Support reference: SPH-11111111-22222222/)).toBeVisible();

    cleanup();
    renderCard(failedState({ supportReference: undefined }));
    expect(screen.getByText(`Support reference: ${RUN_ID}`)).toBeVisible();
  });

  it("keeps a transient provider failure pointed at saved work", () => {
    renderCard(failedState({ rootErrorCode: "provider_unavailable", rootErrorStage: "chapters" }));

    expect(
      screen.getByText(
        "The writing service was briefly unavailable while it was drafting chapters.",
      ),
    ).toBeVisible();
    expect(screen.getByText(/wait a few minutes, then try again/i)).toBeVisible();
    expect(screen.getByText("Reuse compatible checkpoints")).toBeVisible();
  });
});

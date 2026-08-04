// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { RecoveryCard } from "./run-viewer";
import type { RunStreamState } from "@/hooks/use-run-stream";
import type { AuthoringNextAction } from "@/lib/authoring-journey";

const RUN_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

/** The journey's paid restart: a new run, charged again, from saved chapters. */
const RECOVER_SAVED_WORK: AuthoringNextAction = {
  kind: "recover_saved_work",
  href: `/projects/${PROJECT_ID}/write#authoring-recovery`,
  label: "Resume from saved work",
  description: "12 saved chapters are ready to reuse.",
  requiresMeteredAccess: true,
};

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

function renderCard(
  state: RunStreamState,
  overrides: Partial<ComponentProps<typeof RecoveryCard>> = {},
) {
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
      {...overrides}
    />,
  );
}

/** `bg-primary` is the one filled variant: the card's loudest affordance. */
function promoted(element: HTMLElement): boolean {
  return element.className.split(/\s+/).includes("bg-primary");
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

  it("does not make a paid retry the loudest control when retrying is futile", () => {
    renderCard(failedState(), { nextAction: RECOVER_SAVED_WORK, onRecover: () => {} });

    // The card says another attempt would end the same way; the filled button
    // must not be the one that charges for that attempt.
    expect(screen.getByText(/would end the same way/i)).toBeVisible();
    const retry = screen.getByRole("button", { name: "Resume from saved work" });
    const help = screen.getByRole("button", { name: "Get help" });
    expect(promoted(retry)).toBe(false);
    expect(promoted(help)).toBe(true);
    // Demoted, never hidden: an author who disagrees can still restart.
    expect(retry).toBeVisible();
    expect(help.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("offers exactly one way to reach support when the retry is demoted", () => {
    renderCard(failedState(), { nextAction: RECOVER_SAVED_WORK, onRecover: () => {} });

    expect(screen.getAllByRole("button", { name: "Get help" })).toHaveLength(1);
  });

  it("leads with the retry when the copy says another attempt is worth it", () => {
    renderCard(failedState({ rootErrorCode: "provider_unavailable", rootErrorStage: "chapters" }), {
      nextAction: RECOVER_SAVED_WORK,
      onRecover: () => {},
    });

    const retry = screen.getByRole("button", { name: "Resume from saved work" });
    expect(promoted(retry)).toBe(true);
    expect(promoted(screen.getByRole("button", { name: "Get help" }))).toBe(false);
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

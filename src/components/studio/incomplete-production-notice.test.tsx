// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IncompleteProductionNotice } from "@/components/studio/incomplete-production-notice";
import type { AuthoringJourneySnapshot } from "@/lib/authoring-journey";

const NOW = "2026-07-30T12:00:00.000Z";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function journey(nextAction: AuthoringJourneySnapshot["nextAction"]): AuthoringJourneySnapshot {
  return {
    project: {
      id: PROJECT_ID,
      title: "The Orchard Below",
      genre: "literary_fiction",
      status: "editing",
      experience: "trial_short_story",
      updatedAt: NOW,
      targetChapters: 3,
      targetWordsPerChapter: 1000,
      qualityTier: "standard",
    },
    phase: "produce",
    artifacts: {
      briefReady: true,
      bookReady: true,
      fullBookCompletionReady: false,
      outlineReady: true,
      savedChapters: 2,
      savedCheckpoints: 4,
      editedChapters: 0,
      finalChapters: 0,
      totalChapters: 3,
      wordCount: 287,
    },
    access: {
      fullBookUnlocked: false,
      suspended: false,
      balanceCredits: 8,
    },
    spend: { meteredUsd: 0, creditsUsed: 0 },
    run: {
      id: "22222222-2222-4222-8222-222222222222",
      databaseStatus: "failed",
      workflowStatus: "failed",
      effectiveStatus: "failed",
      stage: "failed",
      progressPct: 58,
      stageDescription: "Production stopped after two saved chapters",
      acceptedAt: NOW,
      startedAt: NOW,
      completedAt: NOW,
      lastUpdateAt: NOW,
      acceptanceUncertain: false,
      safeToRetry: true,
      authoringBegan: true,
      noWorkStarted: false,
      completionArtifactsReady: false,
      cancellationRequestedAt: null,
      pause: null,
      health: "needs_attention",
      spend: { meteredUsd: 0, creditsUsed: 0, scope: "run" },
    },
    health: "needs_attention",
    nextAction,
    purchaseAction: null,
    supportReference: "SPH-11111111-22222222",
  };
}

afterEach(cleanup);

describe("IncompleteProductionNotice", () => {
  it("keeps saved-work truth but does not repeat the primary recovery CTA", () => {
    render(
      <IncompleteProductionNotice
        journey={journey({
          kind: "recover_saved_work",
          href: `/projects/${PROJECT_ID}/write`,
          label: "Resume from saved work",
          description:
            "2 saved chapters are ready to reuse. Review the recovery details before you restart.",
          requiresMeteredAccess: true,
        })}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Production stopped before the manuscript was finished.",
      }),
    ).toBeVisible();
    expect(screen.getByText(/2 of 3 chapters are saved/i)).toBeVisible();
    expect(screen.getByText(/2 saved chapters are ready to reuse/i)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Resume from saved work" })).not.toBeInTheDocument();
  });

  it("remains status-only when the global next step is a different action", () => {
    render(
      <IncompleteProductionNotice
        journey={journey({
          kind: "watch_production",
          href: `/projects/${PROJECT_ID}/write`,
          label: "Watch production",
          description: "The durable run remains active.",
          requiresMeteredAccess: false,
        })}
      />,
    );

    expect(screen.getByText(/The durable run remains active/i)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Watch production" })).not.toBeInTheDocument();
  });

  it("does not claim an unfinished manuscript when every chapter is saved", () => {
    const everyChapterSaved = journey({
      kind: "recover_saved_work",
      href: `/projects/${PROJECT_ID}/write`,
      label: "Resume from saved work",
      description: "The final continuity check did not finish.",
      requiresMeteredAccess: true,
    });
    everyChapterSaved.artifacts.savedChapters = 12;
    everyChapterSaved.artifacts.totalChapters = 12;

    render(<IncompleteProductionNotice journey={everyChapterSaved} />);

    expect(
      screen.getByRole("heading", {
        name: "Every chapter is written. Production stopped during the final steps.",
      }),
    ).toBeVisible();
    expect(screen.getByText(/12 of 12 chapters are saved/i)).toBeVisible();
  });

  it("says so plainly when the run stopped before any chapter existed", () => {
    const noChapters = journey({
      kind: "recover_saved_work",
      href: `/projects/${PROJECT_ID}/write`,
      label: "Try starting again",
      description: "No credits were used.",
      requiresMeteredAccess: true,
    });
    noChapters.artifacts.savedChapters = 0;

    render(<IncompleteProductionNotice journey={noChapters} />);

    expect(
      screen.getByRole("heading", { name: "Production stopped before any chapter was written." }),
    ).toBeVisible();
  });

  it("trusts durable completion after the author restructures completed chapters", () => {
    const completed = journey({
      kind: "read_or_export",
      href: `/projects/${PROJECT_ID}/manuscript`,
      label: "Read or export",
      description: "The completed manuscript is ready.",
      requiresMeteredAccess: false,
    });
    completed.artifacts.fullBookCompletionReady = true;
    completed.artifacts.savedChapters = 4;
    completed.artifacts.finalChapters = 0;
    completed.artifacts.totalChapters = 4;
    if (completed.run) {
      completed.run.databaseStatus = "completed";
      completed.run.workflowStatus = "completed";
      completed.run.effectiveStatus = "completed";
      completed.run.stage = "done";
      completed.run.completionArtifactsReady = true;
      completed.run.health = "complete";
    }

    const { container } = render(<IncompleteProductionNotice journey={completed} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Incomplete production")).not.toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/projects/11111111-1111-4111-8111-111111111111/write",
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: navigation.refresh }),
}));

import { AuthoringJourneyCommandProvider } from "@/components/studio/authoring-journey-command";
import { ProjectNextStep } from "@/components/studio/project-next-step";
import { ProjectProgressProvider, useProjectProgress } from "@/components/studio/project-progress";
import {
  deriveAuthoringJourney,
  type AuthoringJourneyRun,
  type AuthoringJourneySeed,
} from "@/lib/authoring-journey";

const NOW = "2026-07-30T12:00:00.000Z";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function run(overrides: Partial<AuthoringJourneyRun> = {}): AuthoringJourneyRun {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    databaseStatus: "running",
    workflowStatus: "running",
    effectiveStatus: "running",
    stage: "chapters",
    progressPct: 37,
    stageDescription: "One chapter assembled",
    acceptedAt: NOW,
    startedAt: NOW,
    completedAt: null,
    lastUpdateAt: NOW,
    acceptanceUncertain: false,
    safeToRetry: false,
    authoringBegan: true,
    noWorkStarted: false,
    completionArtifactsReady: false,
    cancellationRequestedAt: null,
    pause: null,
    health: "healthy",
    spend: { meteredUsd: 0, creditsUsed: 0, scope: "run" },
    ...overrides,
  };
}

function snapshot(activeRun: AuthoringJourneyRun) {
  const seed: AuthoringJourneySeed = {
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
      brief: "A clockmaker follows a hidden map beneath the city.",
      completedAt: null,
    },
    artifacts: {
      bookReady: true,
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
    run: activeRun,
  };
  return deriveAuthoringJourney(seed);
}

function CancellationPublisher({ runId }: { runId: string }) {
  const { publishProgress } = useProjectProgress();
  return (
    <button
      type="button"
      onClick={() =>
        publishProgress({
          runId,
          stage: "chapters",
          pct: 37,
          cancellationRequestedAt: NOW,
          draftedCount: 2,
          totalChapters: 3,
        })
      }
    >
      Accept cancellation
    </button>
  );
}

function renderNextStep(journey: ReturnType<typeof snapshot>) {
  return render(
    <AuthoringJourneyCommandProvider>
      <ProjectProgressProvider
        projectId={PROJECT_ID}
        initialProgress={{
          runId: journey.run?.id ?? null,
          stage: journey.run?.stage ?? "queued",
          pct: journey.run?.progressPct ?? 0,
          draftedCount: journey.artifacts.savedChapters,
          totalChapters: journey.artifacts.totalChapters,
        }}
      >
        <ProjectNextStep snapshot={journey} />
        <CancellationPublisher runId={journey.run?.id ?? ""} />
      </ProjectProgressProvider>
    </AuthoringJourneyCommandProvider>,
  );
}

afterEach(() => {
  cleanup();
  navigation.pathname = `/projects/${PROJECT_ID}/write`;
  navigation.refresh.mockClear();
});

describe("ProjectNextStep presentation", () => {
  it("renders cancellation as passive status on its current route without changing nextAction", () => {
    const journey = snapshot(run({ cancellationRequestedAt: NOW }));
    expect(journey.nextAction.kind).toBe("finish_cancellation");
    expect(journey.nextAction.label).toBe("View the safe stop");

    renderNextStep(journey);

    const region = screen.getByRole("region", { name: "Next step: Stopping safely" });
    expect(
      within(region).getByRole("heading", { name: "Next step: Stopping safely" }),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "View the safe stop" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Stopping safely")).toHaveLength(2);
    expect(within(region).queryByRole("status")).not.toBeInTheDocument();
    expect(region.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(journey.nextAction.label).toBe("View the safe stop");
  });

  it("uses one compact mobile action row for saved-work recovery", () => {
    navigation.pathname = `/projects/${PROJECT_ID}/editor`;
    const journey = snapshot(
      run({
        databaseStatus: "failed",
        workflowStatus: "failed",
        effectiveStatus: "failed",
        stage: "failed",
        progressPct: 58,
        completedAt: NOW,
        safeToRetry: true,
        health: "needs_attention",
      }),
    );

    renderNextStep(journey);

    const region = screen.getByRole("region", {
      name: "Next step: Resume from saved work",
    });
    expect(region).toHaveAttribute("data-compact-mobile", "true");
    expect(region).toHaveClass("min-h-14");
    expect(region).not.toHaveClass("h-14");
    expect(region.querySelector(".truncate")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Resume from saved work" })).toHaveLength(1);
  });

  it("switches the project-wide action to stopping safely as soon as cancellation is accepted", () => {
    const journey = snapshot(run());
    renderNextStep(journey);

    expect(screen.getByRole("link", { name: "Watch production" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Accept cancellation" }));

    const region = screen.getByRole("region", { name: "Next step: Stopping safely" });
    expect(
      within(region).getByRole("heading", { name: "Next step: Stopping safely" }),
    ).toBeVisible();
    expect(
      within(region).queryByRole("link", { name: "Watch production" }),
    ).not.toBeInTheDocument();
    expect(within(region).getAllByText("Stopping safely")).toHaveLength(2);
  });
});

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
import { JourneyActionLink, ProjectNextStep } from "@/components/studio/project-next-step";
import { ProjectProgressProvider, useProjectProgress } from "@/components/studio/project-progress";
import {
  deriveAuthoringJourney,
  type AuthoringJourneyRun,
  type AuthoringJourneySeed,
} from "@/lib/authoring-journey";

const NOW = "2026-07-30T12:00:00.000Z";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const RESUMED_RUN_ID = "33333333-3333-4333-8333-333333333333";

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

function RecoveryProgressPublisher() {
  const { publishProgress } = useProjectProgress();
  return (
    <button
      type="button"
      onClick={() =>
        publishProgress({
          runId: RESUMED_RUN_ID,
          stage: "concept",
          pct: 2,
          detail: "Developing the premise",
          draftedCount: 2,
          totalChapters: 3,
        })
      }
    >
      Publish recovery progress
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
  document.querySelectorAll("#authoring-recovery").forEach((target) => target.remove());
  navigation.pathname = `/projects/${PROJECT_ID}/write`;
  window.history.replaceState({}, "", navigation.pathname);
  navigation.refresh.mockClear();
});

describe("ProjectNextStep presentation", () => {
  it("sets and retains the recovery hash while focusing the target on every activation", () => {
    window.history.replaceState({}, "", `/projects/${PROJECT_ID}/write`);
    const target = document.createElement("section");
    target.id = "authoring-recovery";
    target.scrollIntoView = vi.fn();
    target.getClientRects = vi.fn(() => [{ width: 1, height: 1 }] as unknown as DOMRectList);
    document.body.append(target);

    render(
      <JourneyActionLink
        action={{
          kind: "recover_saved_work",
          href: `/projects/${PROJECT_ID}/write#authoring-recovery`,
          label: "Resume from saved work",
          description: "Review the saved work.",
          requiresMeteredAccess: true,
        }}
      />,
    );
    const link = screen.getByRole("link", { name: "Resume from saved work" });
    fireEvent.click(link);

    expect(window.location.hash).toBe("#authoring-recovery");
    expect(target).toHaveAttribute("tabindex", "-1");
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(target).toHaveFocus();

    target.blur();
    vi.mocked(target.scrollIntoView).mockClear();
    fireEvent.click(link);

    expect(window.location.hash).toBe("#authoring-recovery");
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(target).toHaveFocus();
  });

  it("focuses the visible recovery target when a retained route tree has the same hash id", () => {
    window.history.replaceState({}, "", `/projects/${PROJECT_ID}/write#authoring-recovery`);
    const hiddenTarget = document.createElement("section");
    hiddenTarget.id = "authoring-recovery";
    hiddenTarget.tabIndex = -1;
    hiddenTarget.scrollIntoView = vi.fn();
    hiddenTarget.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
    const visibleTarget = document.createElement("section");
    visibleTarget.id = "authoring-recovery";
    visibleTarget.tabIndex = -1;
    visibleTarget.scrollIntoView = vi.fn();
    visibleTarget.getClientRects = vi.fn(() => [{ width: 1, height: 1 }] as unknown as DOMRectList);
    document.body.append(hiddenTarget, visibleTarget);

    render(
      <JourneyActionLink
        action={{
          kind: "recover_saved_work",
          href: `/projects/${PROJECT_ID}/write#authoring-recovery`,
          label: "Resume from saved work",
          description: "Review the saved work.",
          requiresMeteredAccess: true,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("link", { name: "Resume from saved work" }));

    expect(hiddenTarget.scrollIntoView).not.toHaveBeenCalled();
    expect(visibleTarget.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(visibleTarget).toHaveFocus();
  });
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
    expect(screen.getByRole("link", { name: "Resume from saved work" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/write#authoring-recovery`,
    );
  });

  it("replaces the recovery action when a distinct resumed run reports live progress", () => {
    const interrupted = snapshot(
      run({
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
    );

    render(
      <AuthoringJourneyCommandProvider>
        <ProjectProgressProvider
          projectId={PROJECT_ID}
          initialProgress={{
            runId: interrupted.run?.id ?? null,
            stage: "failed",
            pct: 58,
            draftedCount: 2,
            totalChapters: 3,
          }}
        >
          <ProjectNextStep snapshot={interrupted} />
          <RecoveryProgressPublisher />
        </ProjectProgressProvider>
      </AuthoringJourneyCommandProvider>,
    );

    expect(screen.getByRole("link", { name: "Resume from saved work" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Publish recovery progress" }));

    expect(screen.queryByRole("link", { name: "Resume from saved work" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Watch production" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Next step: Watch production" })).toBeVisible();
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

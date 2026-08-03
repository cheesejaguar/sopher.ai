import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: navigation.refresh }),
}));

import {
  PROJECT_PROGRESS_POLL_MS,
  ProjectProgressProvider,
  useProjectProgress,
} from "./project-progress";

const activeProgress = {
  runId: "66666666-6666-4666-8666-666666666661",
  stage: "chapters" as const,
  pct: 42,
  detail: "4 of 12 chapters drafted",
  draftedCount: 4,
  totalChapters: 12,
};

const failedProgress = {
  ...activeProgress,
  stage: "failed" as const,
  pct: 58,
  detail: "Production stopped after four saved chapters",
};

function ProgressProbe() {
  const { progress } = useProjectProgress();
  return <div data-testid="progress-probe">{`${progress.stage}:${progress.draftedCount}`}</div>;
}

function CompletionPublisher() {
  const { publishProgress } = useProjectProgress();
  const completed = { ...activeProgress, stage: "done" as const, pct: 100, draftedCount: 12 };
  return (
    <>
      <button type="button" onClick={() => publishProgress(completed)}>
        Raw done
      </button>
      <button
        type="button"
        onClick={() => publishProgress(completed, { refreshAuthoritativeJourney: true })}
      >
        Health-confirmed done
      </button>
    </>
  );
}

function AuthoritativeMountPublisher({ progress }: { progress: typeof failedProgress }) {
  const { publishProgress } = useProjectProgress();
  useEffect(() => {
    publishProgress(progress, { refreshAuthoritativeJourney: true });
  }, [progress, publishProgress]);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  navigation.refresh.mockClear();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ProjectProgressProvider polling", () => {
  it("refreshes an active run, announces the update, and stops after a terminal state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          progress: {
            ...activeProgress,
            stage: "done",
            pct: 100,
            detail: undefined,
            draftedCount: 12,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProjectProgressProvider projectId="project-1" initialProgress={activeProgress}>
        <ProgressProbe />
      </ProjectProgressProvider>,
    );

    const liveStatus = screen.getByRole("status");
    expect(liveStatus).toBeEmptyDOMElement();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROJECT_PROGRESS_POLL_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/progress", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
    expect(screen.getByText("done:12")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBe(liveStatus);
    expect(liveStatus).toHaveTextContent("Manuscript complete");
    expect(liveStatus).not.toHaveTextContent("%");
    expect(navigation.refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROJECT_PROGRESS_POLL_MS * 3);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes the journey only when live completion is health-confirmed", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    render(
      <ProjectProgressProvider projectId="project-1" initialProgress={activeProgress}>
        <CompletionPublisher />
      </ProjectProgressProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Raw done" }));
    expect(navigation.refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Health-confirmed done" }));
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh an initial server-authoritative terminal run again on mount", () => {
    render(
      <ProjectProgressProvider projectId="project-1" initialProgress={failedProgress}>
        <AuthoritativeMountPublisher progress={failedProgress} />
      </ProjectProgressProvider>,
    );

    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("still refreshes when a distinct recovery run becomes authoritative and terminal", () => {
    const recoveredFailure = {
      ...failedProgress,
      runId: "66666666-6666-4666-8666-666666666662",
    };

    render(
      <ProjectProgressProvider projectId="project-1" initialProgress={failedProgress}>
        <AuthoritativeMountPublisher progress={recoveredFailure} />
      </ProjectProgressProvider>,
    );

    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not fetch while the project page is hidden and refreshes when it becomes visible", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ progress: activeProgress }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProjectProgressProvider projectId="project-1" initialProgress={activeProgress}>
        <ProgressProbe />
      </ProjectProgressProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROJECT_PROGRESS_POLL_MS * 2);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

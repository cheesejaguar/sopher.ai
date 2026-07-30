import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function ProgressProbe() {
  const { progress } = useProjectProgress();
  return <div data-testid="progress-probe">{`${progress.stage}:${progress.draftedCount}`}</div>;
}

beforeEach(() => {
  vi.useFakeTimers();
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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROJECT_PROGRESS_POLL_MS * 3);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioSuspensionProvider } from "@/components/studio/studio-access-context";

import { ManuscriptRevisionPanel } from "./manuscript-revision-panel";

const push = vi.fn();
const refresh = vi.fn();
const router = { push, refresh };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  push.mockReset();
  refresh.mockReset();
});

describe("ManuscriptRevisionPanel", () => {
  it("starts one non-destructive review and opens the completed suggestion queue", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/edit-pass") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { instruction: string; requestKey: string };
        expect(body.instruction).toBe("Make the dialogue sharper");
        expect(body.requestKey).toMatch(/^[0-9a-f-]{36}$/);
        return new Response(
          JSON.stringify({ run: { id: "run-1", status: "queued" }, maximumCredits: 2 }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/runs/run-1")) {
        return new Response(
          JSON.stringify({
            run: { id: "run-1", status: "completed" },
            health: {
              effectiveStatus: "completed",
              progressPct: 100,
              stageDescription: "Two suggestions ready",
              safeToRetry: false,
              cancellation: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/edit-pass") && !init?.method) {
        return new Response(
          JSON.stringify({
            run: {
              id: "run-1",
              status: "completed",
              instruction: "Make the dialogue sharper",
              completion: { reviewedChapterCount: 3, suggestionCount: 2 },
            },
            suggestionCount: 2,
            firstSuggestionChapter: 2,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ManuscriptRevisionPanel projectId="project-1" chapterCount={3} maximumCredits={2} />);
    fireEvent.change(screen.getByLabelText("What should change across the book?"), {
      target: { value: "Make the dialogue sharper" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review the whole manuscript" }));

    expect(await screen.findByText("Review in progress")).toBeVisible();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/projects/project-1/editor/2?suggestions=1&reviewRun=run-1",
      ),
    );
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByText(/never silently rewritten/i)).toBeVisible();
  });

  it("renders a zero-change completion as a successful, durable result", () => {
    render(
      <ManuscriptRevisionPanel
        projectId="project-1"
        chapterCount={4}
        maximumCredits={3}
        initialRun={{
          id: "run-2",
          status: "completed",
          instruction: "Keep the voice consistent",
          completion: { reviewedChapterCount: 4, suggestionCount: 0 },
        }}
      />,
    );

    expect(screen.getByText("Review complete")).toBeVisible();
    expect(screen.getByText(/zero-change result is saved/i)).toBeVisible();
    expect(screen.queryByRole("link", { name: /review .*suggestion/i })).not.toBeInTheDocument();
  });

  it("keeps polling when completed results are temporarily unavailable", async () => {
    vi.useFakeTimers();
    let latestAttempts = 0;
    let healthAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/runs/run-transient")) {
        healthAttempts += 1;
        return new Response(
          JSON.stringify({
            run: { id: "run-transient", status: "completed" },
            health: {
              effectiveStatus: "completed",
              progressPct: 100,
              stageDescription: "Review complete",
              safeToRetry: false,
              cancellation: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/edit-pass")) {
        latestAttempts += 1;
        if (latestAttempts === 1) {
          return new Response("temporarily unavailable", { status: 503 });
        }
        return new Response(
          JSON.stringify({
            run: {
              id: "run-transient",
              status: "completed",
              instruction: "Strengthen the ending",
              completion: { reviewedChapterCount: 3, suggestionCount: 2 },
            },
            suggestionCount: 2,
            firstSuggestionChapter: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ManuscriptRevisionPanel
        projectId="project-1"
        chapterCount={3}
        maximumCredits={2}
        initialRun={{
          id: "run-transient",
          status: "running",
          instruction: "Strengthen the ending",
        }}
        initialSuggestionCount={4}
        initialFirstSuggestionChapter={3}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Review finished — loading results")).toBeVisible();
    expect(screen.getByText(/saved suggestions are temporarily unavailable/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Check results" })).toBeEnabled();
    expect(screen.queryByText(/no worthwhile changes/i)).not.toBeInTheDocument();
    expect(latestAttempts).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(healthAttempts).toBe(2);
    expect(latestAttempts).toBe(2);
    expect(screen.getByText("Review complete")).toBeVisible();
    expect(screen.getByRole("link", { name: /review 2 suggestions/i })).toBeVisible();
    expect(screen.queryByText(/no worthwhile changes/i)).not.toBeInTheDocument();
  });

  it("reports a lost stop request without claiming the review stopped", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/runs/run-stop")) {
        return new Response(
          JSON.stringify({
            health: {
              effectiveStatus: "running",
              progressPct: 40,
              stageDescription: "Reviewing chapter two",
              safeToRetry: false,
              cancellation: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/generate") && init?.method === "DELETE") {
        throw new TypeError("network unavailable");
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ManuscriptRevisionPanel
        projectId="project-1"
        chapterCount={3}
        maximumCredits={2}
        initialRun={{ id: "run-stop", status: "running", instruction: "Tighten the prose" }}
      />,
    );

    const stop = screen.getByRole("button", { name: "Stop safely" });
    fireEvent.click(stop);

    expect(await screen.findByText(/connection lost while requesting a safe stop/i)).toBeVisible();
    expect(screen.getByText("Review in progress")).toBeVisible();
    expect(stop).toBeEnabled();
  });

  it("keeps reconnect available after a network failure and recovers on retry", async () => {
    let reconnectAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/runs/run-reconnect") && !init?.method) {
        return new Response(
          JSON.stringify({
            health: {
              effectiveStatus: "queued",
              progressPct: 0,
              stageDescription: "Waiting for the writing room",
              safeToRetry: true,
              cancellation: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/runs/run-reconnect/retry-start") && init?.method === "POST") {
        reconnectAttempts += 1;
        if (reconnectAttempts === 1) throw new TypeError("network unavailable");
        return new Response(null, { status: 202 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ManuscriptRevisionPanel
        projectId="project-1"
        chapterCount={3}
        maximumCredits={2}
        initialRun={{ id: "run-reconnect", status: "queued", instruction: "Raise the tension" }}
      />,
    );

    const reconnect = await screen.findByRole("button", { name: "Reconnect" });
    fireEvent.click(reconnect);

    expect(await screen.findByText(/connection lost while reconnecting/i)).toBeVisible();
    expect(reconnect).toBeEnabled();

    fireEvent.click(reconnect);
    await waitFor(() => expect(screen.getByText(/reconnecting the same review/i)).toBeVisible());
    expect(reconnectAttempts).toBe(2);
    expect(screen.queryByText(/connection lost while reconnecting/i)).not.toBeInTheDocument();
  });

  it("keeps paid authoring disabled for a suspended account", () => {
    render(
      <StudioSuspensionProvider suspended>
        <ManuscriptRevisionPanel projectId="project-1" chapterCount={2} maximumCredits={1} />
      </StudioSuspensionProvider>,
    );
    expect(screen.getByRole("button", { name: "Review the whole manuscript" })).toBeDisabled();
  });
});

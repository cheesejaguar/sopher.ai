import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  publishProgress: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: clientMocks.refresh }),
}));

vi.mock("@/components/studio/project-progress", () => ({
  useProjectProgress: () => ({ publishProgress: clientMocks.publishProgress }),
}));

vi.mock("@/components/generation/run-viewer", () => ({
  RunViewer: ({ runId, onRestart }: { runId: string; onRestart: () => void }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement("p", null, `Run ${runId}`),
      React.createElement("button", { type: "button", onClick: onRestart }, "Explicit restart"),
    ),
}));

import { wizardDraftKey, wizardRequestKey } from "@/components/wizard/wizard-state";
import type { RunSnapshot } from "@/hooks/use-run-stream";
import {
  canAttachToWholeBookRun,
  clearRecoveredWizardStorage,
  generationRequestStorageKey,
  isCompletedRequestReplay,
  isSupportRequiredResponse,
  isTerminalRequestReplay,
  journeyAllowsGenerationStart,
  shouldRefreshAuthoritativeJourney,
  WriteExperience,
} from "./write-experience";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const STALE_REQUEST_KEY = "22222222-2222-4222-8222-222222222222";
const ACTIVE_RUN_ID = "33333333-3333-4333-8333-333333333333";
const localValues = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return localValues.size;
  },
  clear: () => localValues.clear(),
  getItem: (key) => localValues.get(key) ?? null,
  key: (index) => [...localValues.keys()][index] ?? null,
  removeItem: (key) => {
    localValues.delete(key);
  },
  setItem: (key, value) => {
    localValues.set(key, String(value));
  },
};

function writeExperienceProps(initialSnapshot: RunSnapshot | null = null) {
  return {
    projectId: PROJECT_ID,
    projectTitle: "The Clockmaker's Map",
    userId: "user_123",
    recoveryRequestKey: null,
    experience: "trial_short_story" as const,
    fullBookUnlocked: false,
    tier: "standard" as const,
    requireOutlineApproval: true,
    targetChapters: 3,
    targetWordsPerChapter: 1000,
    estimateUsd: 0.6,
    balanceCredits: 10,
    requiredCredits: 0,
    initialSnapshot,
    titles: {},
  };
}

function renderPreflight() {
  return render(React.createElement(WriteExperience, writeExperienceProps()));
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
  window.localStorage.clear();
  clientMocks.publishProgress.mockClear();
  clientMocks.refresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shouldRefreshAuthoritativeJourney", () => {
  const progress = {
    stage: "failed" as const,
    pct: 42,
    draftedCount: 1,
    totalChapters: 3,
  };

  it("refreshes only after terminal health has been confirmed", () => {
    expect(shouldRefreshAuthoritativeJourney(progress)).toBe(false);
    expect(shouldRefreshAuthoritativeJourney({ ...progress, authoritativeTerminal: true })).toBe(
      true,
    );
  });
});

describe("canAttachToWholeBookRun", () => {
  it("accepts a newly queued full-book run", () => {
    expect(canAttachToWholeBookRun(202, "run-1", "full_book", "queued")).toBe(true);
  });

  it("reattaches only to an existing full-book run", () => {
    expect(canAttachToWholeBookRun(409, "run-1", "full_book", "running")).toBe(true);
    expect(canAttachToWholeBookRun(409, "run-2", "chapter", "running")).toBe(false);
    expect(canAttachToWholeBookRun(409, "run-3", "edit_pass", "queued")).toBe(false);
  });

  it("never attaches a terminal run even when the response has an attachable status code", () => {
    expect(canAttachToWholeBookRun(202, "run-1", "full_book", "failed")).toBe(false);
    expect(canAttachToWholeBookRun(202, "run-2", "full_book", "cancelled")).toBe(false);
    expect(canAttachToWholeBookRun(202, "run-3", "full_book", "completed")).toBe(false);
    expect(canAttachToWholeBookRun(409, "run-4", "full_book", "failed")).toBe(false);
  });

  it("never attaches without a run id", () => {
    expect(canAttachToWholeBookRun(202, undefined, "full_book")).toBe(false);
  });

  it("scopes uncertain generation request keys to one project", () => {
    expect(generationRequestStorageKey("project-a")).not.toBe(
      generationRequestStorageKey("project-b"),
    );
  });

  it("clears a retained setup only when it belongs to the recovered project", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const userId = "user_123";
    values.set(
      wizardRequestKey(userId, "trial_short_story"),
      "11111111-1111-4111-8111-111111111111",
    );
    values.set(wizardDraftKey(userId, "trial_short_story"), "saved setup");

    expect(
      clearRecoveredWizardStorage(
        storage,
        userId,
        "trial_short_story",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).toBe(false);
    expect(values.get(wizardDraftKey(userId, "trial_short_story"))).toBe("saved setup");

    expect(
      clearRecoveredWizardStorage(
        storage,
        userId,
        "trial_short_story",
        "11111111-1111-4111-8111-111111111111",
      ),
    ).toBe(true);
    expect(values.has(wizardRequestKey(userId, "trial_short_story"))).toBe(false);
    expect(values.has(wizardDraftKey(userId, "trial_short_story"))).toBe(false);
  });

  it("does not clear the retained included-story setup while confirming a paid book", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const userId = "user_123";
    const recoveryKey = "11111111-1111-4111-8111-111111111111";
    values.set(wizardRequestKey(userId, "trial_short_story"), recoveryKey);
    values.set(wizardDraftKey(userId, "trial_short_story"), "saved included setup");

    expect(clearRecoveredWizardStorage(storage, userId, "full_book", recoveryKey)).toBe(false);
    expect(values.get(wizardRequestKey(userId, "trial_short_story"))).toBe(recoveryKey);
    expect(values.get(wizardDraftKey(userId, "trial_short_story"))).toBe("saved included setup");
  });
});

describe("terminal generation request replay", () => {
  it("allows a retried POST only when the refreshed journey explicitly permits it", () => {
    expect(
      journeyAllowsGenerationStart({ journey: { nextAction: { kind: "recover_saved_work" } } }),
    ).toBe(true);
    expect(
      journeyAllowsGenerationStart({ journey: { nextAction: { kind: "start_production" } } }),
    ).toBe(true);
    expect(
      journeyAllowsGenerationStart({ journey: { nextAction: { kind: "read_or_export" } } }),
    ).toBe(false);
    expect(journeyAllowsGenerationStart(null)).toBe(false);
  });

  it("recognizes only an explicitly retryable terminal replay", () => {
    expect(isTerminalRequestReplay(409, { code: "terminal_request_replay", retryable: true })).toBe(
      true,
    );
    expect(
      isTerminalRequestReplay(409, { code: "terminal_request_replay", retryable: false }),
    ).toBe(false);
    expect(isTerminalRequestReplay(202, { code: "terminal_request_replay", retryable: true })).toBe(
      false,
    );
  });

  it("refreshes a completed replay, then honors a separately confirmed paid restart", async () => {
    window.localStorage.setItem(generationRequestStorageKey(PROJECT_ID), STALE_REQUEST_KEY);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "This saved start request already completed.",
            code: "terminal_request_replay",
            retryable: false,
            runId: "44444444-4444-4444-8444-444444444444",
            kind: "full_book",
            status: "completed",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runId: ACTIVE_RUN_ID,
            kind: "full_book",
            status: "queued",
            config: { tier: "standard", targetChapters: 10, targetWordsPerChapter: 2500 },
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const fullBookProps = {
      ...writeExperienceProps(),
      experience: "full_book" as const,
      fullBookUnlocked: true,
      targetChapters: 10,
      targetWordsPerChapter: 2500,
      balanceCredits: 100,
      requiredCredits: 20,
    };
    const rendered = render(React.createElement(WriteExperience, fullBookProps));
    fireEvent.click(screen.getByRole("button", { name: "Start writing this book" }));

    await waitFor(() => expect(clientMocks.refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(generationRequestStorageKey(PROJECT_ID))).toBeNull();
    expect(clientMocks.publishProgress).not.toHaveBeenCalled();

    rendered.rerender(
      React.createElement(WriteExperience, {
        ...fullBookProps,
        initialSnapshot: {
          run: {
            id: "44444444-4444-4444-8444-444444444444",
            status: "completed",
            error: null,
            kind: "full_book",
          },
          events: [],
          chapters: [],
          totalUsd: 0,
        },
      }),
    );
    expect(await screen.findByText("Run 44444444-4444-4444-8444-444444444444")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start writing this book" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Explicit restart" }));
    expect(await screen.findByText(`Run ${ACTIVE_RUN_ID}`)).toBeVisible();
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual(["POST", "POST"]);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      requestKey: string;
    };
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      requestKey: string;
    };
    expect(firstBody.requestKey).toBe(STALE_REQUEST_KEY);
    expect(secondBody.requestKey).not.toBe(STALE_REQUEST_KEY);
    expect(clientMocks.refresh).toHaveBeenCalledOnce();
  });

  it("refreshes a support-required safety decision and blocks repeated generation posts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "This project needs a safety recheck.",
            code: "support_required",
            action: { kind: "contact_support" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            journey: {
              nextAction: {
                kind: "contact_support",
                description: "Support is still verifying the prior provider attempt.",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderPreflight();
    const start = screen.getByRole("button", { name: "Start my included story" });
    fireEvent.click(start);
    await waitFor(() => expect(clientMocks.refresh).toHaveBeenCalledOnce());
    fireEvent.click(start);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual(["POST", "GET"]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Support is still verifying the prior provider attempt.",
    );
    expect(isSupportRequiredResponse(409, { code: "support_required" })).toBe(true);
    expect(window.localStorage.getItem(generationRequestStorageKey(PROJECT_ID))).toBeNull();
  });

  it("rechecks a null-snapshot safety latch and starts only after recovery is allowed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "This project needs a safety recheck.",
            code: "support_required",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ journey: { nextAction: { kind: "recover_saved_work" } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runId: ACTIVE_RUN_ID,
            kind: "full_book",
            status: "queued",
            config: { tier: "standard", targetChapters: 3, targetWordsPerChapter: 1000 },
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderPreflight();
    const start = screen.getByRole("button", { name: "Start my included story" });
    fireEvent.click(start);
    await waitFor(() => expect(clientMocks.refresh).toHaveBeenCalledOnce());
    fireEvent.click(start);

    expect(await screen.findByText(`Run ${ACTIVE_RUN_ID}`)).toBeVisible();
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual(["POST", "GET", "POST"]);
  });

  it("distinguishes a completed replay from a retryable failed replay", () => {
    expect(
      isCompletedRequestReplay(409, {
        code: "terminal_request_replay",
        retryable: false,
        status: "completed",
      }),
    ).toBe(true);
    expect(
      isCompletedRequestReplay(409, {
        code: "terminal_request_replay",
        retryable: true,
        status: "failed",
      }),
    ).toBe(false);
  });

  it("retires a stale key, retries once, and publishes the replacement run immediately", async () => {
    window.localStorage.setItem(generationRequestStorageKey(PROJECT_ID), STALE_REQUEST_KEY);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "The old run is terminal.",
            code: "terminal_request_replay",
            retryable: true,
            runId: "44444444-4444-4444-8444-444444444444",
            kind: "full_book",
            status: "failed",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runId: ACTIVE_RUN_ID,
            kind: "full_book",
            status: "queued",
            config: { tier: "standard", targetChapters: 3, targetWordsPerChapter: 1000 },
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderPreflight();
    fireEvent.click(screen.getByRole("button", { name: "Start my included story" }));

    expect(await screen.findByText(`Run ${ACTIVE_RUN_ID}`)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      requestKey: string;
    };
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      requestKey: string;
    };
    expect(firstBody.requestKey).toBe(STALE_REQUEST_KEY);
    expect(secondBody.requestKey).not.toBe(STALE_REQUEST_KEY);
    expect(secondBody.requestKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(window.localStorage.getItem(generationRequestStorageKey(PROJECT_ID))).toBeNull();
    expect(clientMocks.publishProgress).toHaveBeenCalledWith({
      runId: ACTIVE_RUN_ID,
      stage: "queued",
      pct: 0,
      detail: "Preparing the writing room",
      draftedCount: 0,
      totalChapters: 3,
    });
  });

  it.each([
    { status: "running" as const, responseStatus: 409, reattached: false },
    { status: "awaiting_input" as const, responseStatus: 202, reattached: true },
    { status: "queued" as const, responseStatus: 409, reattached: false },
  ])(
    "waits for authoritative server state when reattaching to a $status run",
    async ({ status, responseStatus, reattached }) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            runId: ACTIVE_RUN_ID,
            kind: "full_book",
            status,
            ...(reattached ? { reattached: true } : {}),
            config: { tier: "standard", targetChapters: 3, targetWordsPerChapter: 1000 },
          }),
          { status: responseStatus, headers: { "Content-Type": "application/json" } },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const rendered = renderPreflight();
      fireEvent.click(screen.getByRole("button", { name: "Start my included story" }));

      await waitFor(() => expect(clientMocks.refresh).toHaveBeenCalledOnce());
      expect(screen.queryByText(`Run ${ACTIVE_RUN_ID}`)).not.toBeInTheDocument();
      expect(clientMocks.publishProgress).not.toHaveBeenCalled();

      rendered.rerender(
        React.createElement(
          WriteExperience,
          writeExperienceProps({
            run: { id: ACTIVE_RUN_ID, status, error: null, kind: "full_book" },
            events: [],
            chapters: [],
            totalUsd: 0,
            health: {
              databaseStatus: status,
              effectiveStatus: status,
              stage: status === "awaiting_input" ? "awaiting_guidance" : "concept",
              progressPct: status === "queued" ? 0 : 7,
              health: "healthy",
            },
          }),
        ),
      );
      expect(await screen.findByText(`Run ${ACTIVE_RUN_ID}`)).toBeVisible();
    },
  );

  it("does not loop when the fresh request also resolves to a terminal run", async () => {
    window.localStorage.setItem(generationRequestStorageKey(PROJECT_ID), STALE_REQUEST_KEY);
    const terminal = () =>
      new Response(
        JSON.stringify({
          error: "The saved request is no longer active.",
          code: "terminal_request_replay",
          retryable: true,
          runId: "44444444-4444-4444-8444-444444444444",
          kind: "full_book",
          status: "failed",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    const fetchMock = vi.fn().mockImplementation(async () => terminal());
    vi.stubGlobal("fetch", fetchMock);

    renderPreflight();
    fireEvent.click(screen.getByRole("button", { name: "Start my included story" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The saved request is no longer active.",
    );
    expect(window.localStorage.getItem(generationRequestStorageKey(PROJECT_ID))).toBeNull();
    expect(clientMocks.publishProgress).not.toHaveBeenCalled();
  });
});

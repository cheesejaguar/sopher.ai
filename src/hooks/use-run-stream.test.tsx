// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseRunHealthResponse, useRunStream, type RunSnapshot } from "@/hooks/use-run-stream";

function snapshot(): RunSnapshot {
  return {
    run: {
      id: "run-1",
      status: "running",
      error: null,
      workflowRunId: "workflow-1",
      createdAt: "2026-07-30T12:00:00.000Z",
      startedAt: "2026-07-30T12:00:01.000Z",
      completedAt: null,
    },
    health: {
      databaseStatus: "running",
      effectiveStatus: "running",
      workflowStatus: "running",
      noWorkStarted: true,
    },
    events: [],
    chapters: [{ number: 2, status: "drafting" }],
  };
}

function healthResponse() {
  return new Response(
    JSON.stringify({
      run: {
        id: "run-1",
        status: "running",
        error: null,
        workflowRunId: "workflow-1",
      },
      health: {
        databaseStatus: "running",
        workflowStatus: "running",
        effectiveStatus: "running",
        noWorkStarted: false,
        stage: "chapters",
        progressPct: 40,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function completedHealthResponse() {
  return new Response(
    JSON.stringify({
      run: {
        id: "run-1",
        status: "completed",
        error: null,
        workflowRunId: "workflow-1",
      },
      health: {
        databaseStatus: "completed",
        workflowStatus: "completed",
        effectiveStatus: "completed",
        noWorkStarted: false,
        stage: "done",
        progressPct: 100,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function ndjson(lines: string[]) {
  return new Response(`${lines.join("\n")}\n`, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useRunStream telemetry recovery", () => {
  it("clears a resolved durable pause and missing-Workflow marker", () => {
    const previous = {
      databaseStatus: "awaiting_input" as const,
      effectiveStatus: "awaiting_input" as const,
      noWorkStarted: false,
      workflowMissingSince: "2026-07-30T12:00:00.000Z",
      pause: {
        kind: "outline_approval" as const,
        version: 1,
        registeredAt: "2026-07-30T12:00:00.000Z",
        details: null,
      },
    };

    expect(
      parseRunHealthResponse(
        {
          run: { status: "running" },
          health: {
            databaseStatus: "running",
            effectiveStatus: "running",
            noWorkStarted: false,
            workflowMissingSince: null,
            pause: null,
          },
        },
        previous,
      )?.health,
    ).toMatchObject({
      databaseStatus: "running",
      effectiveStatus: "running",
      workflowMissingSince: null,
      pause: null,
    });
  });

  it("uses effective failure on first render instead of cosmetically finalizing chapters", () => {
    const contradictory = snapshot();
    contradictory.run.status = "completed";
    contradictory.health = {
      ...contradictory.health,
      databaseStatus: "completed",
      effectiveStatus: "failed",
      stage: "failed",
      progressPct: 80,
    };
    contradictory.chapters = [
      { number: 1, status: "drafted" },
      { number: 2, status: "planned" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    const { result, unmount } = renderHook(() => useRunStream("run-1", contradictory));

    expect(result.current.state.stage).toBe("failed");
    expect(result.current.state.chapters.get(1)?.status).toBe("drafted");
    expect(result.current.state.chapters.get(2)?.status).toBe("planned");
    unmount();
  });

  it("hydrates durable progress, pause, and cancellation state before the first poll", () => {
    const durableSnapshot = snapshot();
    durableSnapshot.health = {
      ...durableSnapshot.health,
      stage: "chapters",
      progressPct: 37,
      stageDescription: "Chapter 2 is being assembled.",
      cancellation: {
        requestedAt: "2026-07-30T12:05:00.000Z",
        reason: "Cancelled by author",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    const { result, unmount } = renderHook(() => useRunStream("run-1", durableSnapshot));

    expect(result.current.state).toMatchObject({
      stage: "chapters",
      pct: 37,
      detail: "Chapter 2 is being assembled.",
      health: {
        cancellation: {
          reason: "Cancelled by author",
        },
      },
    });

    unmount();
  });

  it("counts malformed and schema-invalid progress records without hiding later valid progress", async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url.includes("/stream?ns=progress")) {
        return ndjson([
          "{not-json",
          JSON.stringify({ type: "chapter", chapterNumber: "two", status: "drafted" }),
          JSON.stringify({ type: "stage", stage: "done", pct: 100 }),
        ]);
      }
      if (url === "/api/runs/run-1") return completedHealthResponse();
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useRunStream("run-1", snapshot()));

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        stage: "done",
        pct: 100,
        connection: "ended",
        health: {
          invalidStreamRecords: 2,
        },
      });
    });
    expect(console.warn).toHaveBeenCalledWith(
      "Ignored malformed authoring stream record",
      expect.objectContaining({ runId: "run-1" }),
    );
    expect(console.warn).toHaveBeenCalledWith(
      "Ignored invalid authoring stream record",
      expect.objectContaining({ runId: "run-1" }),
    );

    unmount();
  });

  it("does not trust a terminal stream hint until run health confirms it", async () => {
    let progressRequests = 0;
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url.includes("/stream?ns=progress")) {
        progressRequests += 1;
        if (progressRequests === 1) {
          return ndjson([JSON.stringify({ type: "stage", stage: "done", pct: 100 })]);
        }
        return new Promise<Response>(() => {});
      }
      if (url === "/api/runs/run-1") return healthResponse();
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useRunStream("run-1", snapshot()));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/runs/run-1", {
        cache: "no-store",
        signal: expect.any(AbortSignal),
      });
      expect(result.current.state.health.effectiveStatus).toBe("running");
      expect(result.current.state.connection).not.toBe("ended");
      expect(result.current.state.stage).toBe("chapters");
    });

    unmount();
  });

  it("counts invalid chapter records and replaces stream text with the authoritative saved chapter", async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url.includes("/stream?ns=progress")) {
        return ndjson([JSON.stringify({ type: "stage", stage: "done", pct: 100 })]);
      }
      if (url.includes("/stream?ns=chapter%3A2")) {
        return ndjson([
          JSON.stringify("Draft "),
          JSON.stringify({ unexpected: "record" }),
          JSON.stringify("text"),
        ]);
      }
      if (url === "/api/runs/run-1/chapters/2") {
        return new Response(
          JSON.stringify({
            saved: true,
            content: "Authoritative saved chapter.",
            runStatus: "running",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "/api/runs/run-1") return healthResponse();
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useRunStream("run-1", snapshot()));
    const received: string[] = [];
    let unsubscribe = () => {};
    act(() => {
      unsubscribe = result.current.subscribeChapterProse(2, (text) => received.push(text));
    });

    await waitFor(() => {
      expect(received.at(-1)).toBe("Authoritative saved chapter.");
      expect(result.current.state.health.invalidStreamRecords).toBe(1);
    });
    expect(received).toContain("Draft ");
    expect(received).toContain("Draft text");
    expect(fetchMock).toHaveBeenCalledWith("/api/runs/run-1/chapters/2", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
    expect(console.warn).toHaveBeenCalledWith(
      "Ignored invalid chapter stream record",
      expect.objectContaining({ runId: "run-1", chapterNumber: 2 }),
    );

    act(() => unsubscribe());
    unmount();
  });

  it("hydrates an already saved active-run chapter without waiting for its Workflow stream", async () => {
    const savedSnapshot = snapshot();
    savedSnapshot.chapters = [{ number: 2, status: "drafted", wordCount: 142 }];
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url.includes("/stream?ns=progress")) {
        return new Promise<Response>(() => {});
      }
      if (url === "/api/runs/run-1/chapters/2") {
        return new Response(
          JSON.stringify({
            saved: true,
            content: "Durable prose loaded before the stream.",
            runStatus: "running",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/stream?ns=chapter%3A2")) {
        return new Promise<Response>(() => {});
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useRunStream("run-1", savedSnapshot));
    const received: string[] = [];
    let unsubscribe = () => {};
    act(() => {
      unsubscribe = result.current.subscribeChapterProse(2, (text) => received.push(text));
    });

    await waitFor(() => {
      expect(received).toEqual(["Durable prose loaded before the stream."]);
    });
    expect(
      fetchMock.mock.calls.some(([request]) => String(request).includes("/stream?ns=chapter%3A2")),
    ).toBe(false);

    act(() => unsubscribe());
    unmount();
  });

  it("checks durable prose after a chapter stream failure before reconnecting", async () => {
    let chapterStreamRequests = 0;
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url.includes("/stream?ns=progress")) {
        return new Promise<Response>(() => {});
      }
      if (url.includes("/stream?ns=chapter%3A2")) {
        chapterStreamRequests += 1;
        return new Response(null, { status: 503 });
      }
      if (url === "/api/runs/run-1/chapters/2") {
        return new Response(
          JSON.stringify({
            saved: true,
            content: "Durable prose survived the stream failure.",
            runStatus: "running",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useRunStream("run-1", snapshot()));
    const received: string[] = [];
    let unsubscribe = () => {};
    act(() => {
      unsubscribe = result.current.subscribeChapterProse(2, (text) => received.push(text));
    });

    await waitFor(() => {
      expect(received.at(-1)).toBe("Durable prose survived the stream failure.");
    });
    expect(chapterStreamRequests).toBe(1);

    act(() => unsubscribe());
    unmount();
  });

  it("marks a stop as requested without optimistically terminalizing the run", async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url.includes("/stream?ns=progress")) {
        return ndjson([JSON.stringify({ type: "stage", stage: "chapters", pct: 40 })]);
      }
      if (url === "/api/runs/run-1") return healthResponse();
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useRunStream("run-1", snapshot()));
    act(() => result.current.markCancelled());

    expect(result.current.state.health).toMatchObject({
      databaseStatus: "running",
      effectiveStatus: "running",
      health: "warning",
      cancellation: {
        reason: "Cancelled by author",
      },
    });
    expect(result.current.state.stage).not.toBe("cancelled");
    expect(result.current.state.detail).toBe("Stopping safely");

    unmount();
  });

  it("cancels the active progress reader when its project view unmounts", async () => {
    const cancel = vi.fn();
    const progress = new ReadableStream<Uint8Array>({
      pull() {
        // Stay open until navigation aborts the reader.
      },
      cancel,
    });
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url.includes("/stream?ns=progress")) {
        return new Response(progress, {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" },
        });
      }
      if (url === "/api/runs/run-1") return new Promise<Response>(() => {});
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = renderHook(() => useRunStream("run-1", snapshot()));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/runs/run-1/stream?ns=progress&startIndex=0",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    unmount();

    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
});

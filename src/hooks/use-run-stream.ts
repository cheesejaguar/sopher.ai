"use client";

import * as React from "react";
import { runEventSchema, type RunEvent, type Stage } from "@/lib/run-events";

/**
 * Client hook over GET /api/runs/[runId]/stream (NDJSON).
 *
 * The "progress" namespace carries RunEvents; "chapter:N" namespaces carry
 * JSON-encoded prose delta strings. Both are resumable: we count every stream
 * value received and pass it back as ?startIndex on reconnect so replay
 * resumes exactly where the connection dropped.
 *
 * Consumers must remount the hook when runId changes (key the component by
 * runId) — internal accumulators are per-run.
 */

export type ChapterStatus = "planned" | "drafting" | "drafted" | "edited" | "final";

export type ChapterProgress = {
  status: ChapterStatus;
  wordCount?: number;
  qualityScore?: number;
};

export type AgentName = Extract<RunEvent, { type: "agent" }>["agent"];

export type AgentFeedItem = {
  id: number;
  agent: AgentName;
  message: string;
  chapterNumber?: number;
};

export type RunConnection = "connecting" | "live" | "ended" | "reconnecting";

export type RunStreamState = {
  stage: Stage;
  pct: number;
  detail?: string;
  chapters: Map<number, ChapterProgress>;
  agentFeed: AgentFeedItem[];
  totalUsd: number;
  review?: { score: number; recommendation: string; issueCount: number };
  error?: { message: string; fatal: boolean };
  connection: RunConnection;
};

export type RunStatus =
  "queued" | "running" | "awaiting_input" | "completed" | "failed" | "cancelled";

/** Page-load snapshot (run row + persisted progress events + DB chapter statuses). */
export type RunSnapshot = {
  run: { id: string; status: RunStatus; error: string | null };
  /** Persisted event payloads in seq order (validated here; invalid ones dropped). */
  events: unknown[];
  /** Chapter statuses read from the DB at render time. */
  chapters?: { number: number; status: ChapterStatus; wordCount?: number; qualityScore?: number }[];
  /** Metered spend for this run at render time. */
  totalUsd?: number;
};

const TERMINAL_STAGES: ReadonlySet<Stage> = new Set(["done", "failed", "cancelled"]);
const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set(["completed", "failed", "cancelled"]);

/** Stages only move forward within a run; replay merges are upgrade-only. */
const STAGE_ORDER: Record<Stage, number> = {
  queued: 0,
  concept: 1,
  outline: 2,
  awaiting_approval: 3,
  chapters: 4,
  editing: 5,
  continuity: 6,
  revising: 7,
  finalizing: 8,
  done: 9,
  failed: 10,
  cancelled: 11,
};

const CHAPTER_ORDER: Record<ChapterStatus, number> = {
  planned: 0,
  drafting: 1,
  drafted: 2,
  edited: 3,
  final: 4,
};

const FEED_CAP = 100;

type Acc = {
  stage: Stage;
  pct: number;
  detail?: string;
  chapters: Map<number, ChapterProgress>;
  agentFeed: AgentFeedItem[];
  feedSeq: number;
  totalUsd: number;
  review?: { score: number; recommendation: string; issueCount: number };
  error?: { message: string; fatal: boolean };
};

function applyEvent(acc: Acc, event: RunEvent): void {
  switch (event.type) {
    case "stage": {
      if (STAGE_ORDER[event.stage] >= STAGE_ORDER[acc.stage]) {
        acc.stage = event.stage;
        acc.detail = event.detail;
      }
      acc.pct = Math.max(acc.pct, event.pct);
      if (event.stage === "done") {
        for (const [n, ch] of acc.chapters) {
          acc.chapters.set(n, { ...ch, status: "final" });
        }
      }
      break;
    }
    case "chapter": {
      const prev = acc.chapters.get(event.chapterNumber);
      const upgraded = !prev || CHAPTER_ORDER[event.status] >= CHAPTER_ORDER[prev.status];
      acc.chapters.set(event.chapterNumber, {
        status: upgraded ? event.status : (prev?.status ?? event.status),
        wordCount: event.wordCount ?? prev?.wordCount,
        qualityScore: event.qualityScore ?? prev?.qualityScore,
      });
      break;
    }
    case "agent": {
      acc.feedSeq += 1;
      acc.agentFeed.push({
        id: acc.feedSeq,
        agent: event.agent,
        message: event.message,
        chapterNumber: event.chapterNumber,
      });
      if (acc.agentFeed.length > FEED_CAP) {
        acc.agentFeed.splice(0, acc.agentFeed.length - FEED_CAP);
      }
      break;
    }
    case "cost": {
      // Cost events carry the cumulative run total; never regress a fresher DB seed.
      acc.totalUsd = Math.max(acc.totalUsd, event.totalUsd);
      break;
    }
    case "review": {
      acc.review = {
        score: event.score,
        recommendation: event.recommendation,
        issueCount: event.issueCount,
      };
      break;
    }
    case "error": {
      acc.error = { message: event.message, fatal: event.fatal };
      if (event.fatal && STAGE_ORDER[acc.stage] < STAGE_ORDER.failed) {
        acc.stage = "failed";
      }
      break;
    }
  }
}

function applyRunStatus(acc: Acc, status: RunStatus, error: string | null): void {
  switch (status) {
    case "completed":
      applyEvent(acc, { type: "stage", stage: "done", pct: 100 });
      break;
    case "failed":
      acc.stage = "failed";
      acc.error ??= { message: error ?? "Generation failed", fatal: true };
      break;
    case "cancelled":
      acc.stage = "cancelled";
      break;
    case "awaiting_input":
      if (STAGE_ORDER[acc.stage] < STAGE_ORDER.awaiting_approval) {
        acc.stage = "awaiting_approval";
      }
      break;
    default:
      break;
  }
}

function initFromSnapshot(snapshot: RunSnapshot): Acc {
  const acc: Acc = {
    stage: "queued",
    pct: 0,
    chapters: new Map(
      (snapshot.chapters ?? []).map((c) => [
        c.number,
        { status: c.status, wordCount: c.wordCount, qualityScore: c.qualityScore },
      ]),
    ),
    agentFeed: [],
    feedSeq: 0,
    totalUsd: snapshot.totalUsd ?? 0,
  };
  for (const payload of snapshot.events) {
    const parsed = runEventSchema.safeParse(payload);
    if (parsed.success) applyEvent(acc, parsed.data);
  }
  applyRunStatus(acc, snapshot.run.status, snapshot.run.error);
  return acc;
}

function materialize(acc: Acc, connection: RunConnection): RunStreamState {
  return {
    stage: acc.stage,
    pct: acc.pct,
    detail: acc.detail,
    chapters: new Map(acc.chapters),
    agentFeed: [...acc.agentFeed],
    totalUsd: acc.totalUsd,
    review: acc.review,
    error: acc.error,
    connection,
  };
}

function backoffMs(attempt: number): number {
  return Math.min(10_000, 1_000 * 2 ** Math.min(attempt - 1, 3));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", done);
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

/**
 * Reads an NDJSON body, invoking onLine for every complete line. Returns when
 * the stream ends; throws on network failure.
 */
async function readNdjson(body: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim().length > 0) onLine(line);
      }
    }
    if (buffer.trim().length > 0) onLine(buffer);
  } finally {
    reader.releaseLock();
  }
}

export type UseRunStreamResult = {
  state: RunStreamState;
  /**
   * Opens a resumable reader on the chapter's prose namespace. The listener
   * receives the full accumulated text after every delta batch. Returns an
   * unsubscribe function.
   */
  subscribeChapterProse: (chapterNumber: number, onText: (fullText: string) => void) => () => void;
  /** Locally reflect a successful cancel (the DELETE endpoint emits no event). */
  markCancelled: () => void;
};

export function useRunStream(runId: string, snapshot: RunSnapshot): UseRunStreamResult {
  const terminalAtMount = TERMINAL_STATUSES.has(snapshot.run.status);

  // Computed once per mount (consumers key by runId): the mutable accumulator
  // and the state materialized from the server snapshot.
  const [initial] = React.useState<{
    acc: Acc;
    connection: RunConnection;
    state: RunStreamState;
  }>(() => {
    const acc = initFromSnapshot(snapshot);
    const connection: RunConnection = TERMINAL_STATUSES.has(snapshot.run.status)
      ? "ended"
      : "connecting";
    return { acc, connection, state: materialize(acc, connection) };
  });

  const accRef = React.useRef(initial.acc);
  const connRef = React.useRef(initial.connection);
  const stoppedRef = React.useRef(false);
  const abortRef = React.useRef<(() => void) | null>(null);

  const [state, setState] = React.useState<RunStreamState>(initial.state);

  const publish = React.useCallback((connection?: RunConnection) => {
    if (connection) connRef.current = connection;
    setState(materialize(accRef.current, connRef.current));
  }, []);

  React.useEffect(() => {
    if (terminalAtMount) return;

    const controller = new AbortController();
    const { signal } = controller;
    abortRef.current = () => controller.abort();
    let received = 0;
    let attempt = 0;

    async function fetchRunStatus(): Promise<{ status: RunStatus; error: string | null } | null> {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store", signal });
        if (!res.ok) return null;
        const json: unknown = await res.json();
        const run = (json as { run?: { status?: RunStatus; error?: string | null } }).run;
        return run?.status ? { status: run.status, error: run.error ?? null } : null;
      } catch {
        return null;
      }
    }

    async function run() {
      const acc = accRef.current;
      while (!signal.aborted && !stoppedRef.current) {
        publish(received > 0 || attempt > 0 ? "reconnecting" : "connecting");
        try {
          const res = await fetch(`/api/runs/${runId}/stream?ns=progress&startIndex=${received}`, {
            cache: "no-store",
            signal,
          });
          if (!res.ok || !res.body) throw new Error(`Stream responded ${res.status}`);
          attempt = 0;
          if (received === 0) {
            // Full replay is about to arrive; rebuild the append-only feed from
            // events so snapshot-seeded entries are not duplicated.
            acc.agentFeed = [];
            acc.feedSeq = 0;
          }
          publish("live");

          let dirty = false;
          await readNdjson(res.body, (line) => {
            received += 1;
            try {
              const parsed: unknown = JSON.parse(line);
              const event = runEventSchema.safeParse(parsed);
              if (event.success) {
                applyEvent(acc, event.data);
                dirty = true;
              }
            } catch {
              // Drop lines that are not valid JSON.
            }
            if (dirty) {
              publish();
              dirty = false;
            }
          });

          // Stream ended. If the run reached a terminal stage this is the real
          // end; otherwise confirm against the run row before reconnecting.
          if (TERMINAL_STAGES.has(acc.stage)) {
            publish("ended");
            return;
          }
          const runRow = await fetchRunStatus();
          if (runRow && TERMINAL_STATUSES.has(runRow.status)) {
            applyRunStatus(acc, runRow.status, runRow.error);
            publish("ended");
            return;
          }
          throw new Error("Stream ended while the run was still active");
        } catch {
          if (signal.aborted || stoppedRef.current) return;
          attempt += 1;
          publish("reconnecting");
          await sleep(backoffMs(attempt), signal);
        }
      }
    }

    void run();
    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [runId, terminalAtMount, publish]);

  const subscribeChapterProse = React.useCallback(
    (chapterNumber: number, onText: (fullText: string) => void) => {
      const controller = new AbortController();
      const { signal } = controller;
      let received = 0;
      let text = "";

      async function run() {
        let attempt = 0;
        const namespace = encodeURIComponent(`chapter:${chapterNumber}`);
        while (!signal.aborted) {
          try {
            const res = await fetch(
              `/api/runs/${runId}/stream?ns=${namespace}&startIndex=${received}`,
              { cache: "no-store", signal },
            );
            if (!res.ok || !res.body) throw new Error(`Prose stream responded ${res.status}`);
            attempt = 0;

            let dirty = false;
            await readNdjson(res.body, (line) => {
              received += 1;
              try {
                const delta: unknown = JSON.parse(line);
                if (typeof delta === "string" && delta.length > 0) {
                  text += delta;
                  dirty = true;
                }
              } catch {
                // Drop lines that are not valid JSON.
              }
              if (dirty && !signal.aborted) {
                onText(text);
                dirty = false;
              }
            });
            // Clean end: the run finished, so the prose replay is complete.
            return;
          } catch {
            if (signal.aborted) return;
            attempt += 1;
            await sleep(backoffMs(attempt), signal);
          }
        }
      }

      void run();
      return () => controller.abort();
    },
    [runId],
  );

  const markCancelled = React.useCallback(() => {
    stoppedRef.current = true;
    abortRef.current?.();
    accRef.current.stage = "cancelled";
    publish("ended");
  }, [publish]);

  return { state, subscribeChapterProse, markCancelled };
}

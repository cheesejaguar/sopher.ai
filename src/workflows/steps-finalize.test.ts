import { beforeEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";
import type { GenerationConfig } from "@/lib/run-events";
import type { ManuscriptStateRow } from "@/lib/manuscript-state";
import { manuscriptDigest } from "@/lib/manuscript-state";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  withDbTransaction: vi.fn(),
  write: vi.fn(),
  sendBookFinishedEmail: vi.fn(),
}));

vi.mock("workflow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("workflow")>()),
  getStepMetadata: () => ({ stepId: "finalize-1" }),
  getWritable: () => ({
    getWriter: () => ({ write: mocks.write, releaseLock: vi.fn() }),
  }),
}));
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: mocks.getDb,
  withDbTransaction: mocks.withDbTransaction,
}));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendBookFinishedEmail: mocks.sendBookFinishedEmail,
}));

import { schema } from "@/db";
import { finalizeStep } from "./steps";

const ref = { dbRunId: "run-1", projectId: "project-1", userId: "user-1" };
const baseConfig = {
  targetChapters: 6,
  targetWordsPerChapter: 1_000,
} as GenerationConfig;

function chapter(chapterNumber: number, words: number): ManuscriptStateRow {
  return {
    id: `chapter-${chapterNumber}`,
    chapterNumber,
    title: `Chapter ${chapterNumber}`,
    summary: "A saved chapter.",
    status: chapterNumber % 2 === 0 ? "edited" : "drafted",
    content: Array(words).fill("prose").join(" "),
    wordCount: words,
  };
}

function chain(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["where", "limit", "orderBy", "onConflictDoNothing"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return builder;
}

/** State persists between invocations, as it does on a finalization replay. */
function database(
  options: {
    chapters?: ManuscriptStateRow[];
    config?: GenerationConfig;
    status?: string;
    cancellationRequestedAt?: Date | null;
    outlineTargets?: { number: number; targetWords: number }[];
    existingDone?: boolean;
  } = {},
) {
  const run = {
    status: options.status ?? "running",
    config: options.config ?? baseConfig,
    nextEventSeq: 7,
    cancellationRequestedAt: options.cancellationRequestedAt ?? null,
  };
  const chapters = options.chapters ?? Array.from({ length: 6 }, (_, i) => chapter(i + 1, 1_000));
  const events: Record<string, unknown>[] = options.existingDone ? [{ id: "done-1", seq: 6 }] : [];
  const ledger: Record<string, unknown>[] = [];
  const from = vi.fn((table: unknown, selection?: Record<string, unknown>) => {
    if (table === schema.generationRuns) return chain([run]);
    if (table === schema.books) return chain([{ id: "book-1" }]);
    if (table === schema.outlines) {
      return chain(
        options.outlineTargets ? [{ content: { chapters: options.outlineTargets } }] : [],
      );
    }
    if (table === schema.chapters) return chain(chapters);
    if (table === schema.generationEvents) {
      return chain(selection?.maxSeq ? [{ maxSeq: events.length ? 6 : 0 }] : events);
    }
    throw new Error("Unexpected finalization read");
  });
  const update = vi.fn((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => {
      if (table === schema.generationRuns) Object.assign(run, values);
      if (table === schema.chapters) {
        for (const row of chapters) {
          if (row.status === "drafted" || row.status === "edited") Object.assign(row, values);
        }
      }
      return chain([]);
    }),
  }));
  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((values: Record<string, unknown>) => {
      if (table === schema.generationEvents) events.push(values);
      if (table === schema.creditLedger) ledger.push(values);
      return chain([]);
    }),
  }));
  const tx = {
    execute: vi.fn().mockResolvedValue([]),
    select: vi.fn((selection?: Record<string, unknown>) => ({
      from: (table: unknown) => from(table, selection),
    })),
    update,
    insert,
  };
  mocks.withDbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback(tx),
  );
  // Notification query: no author email means no external message is sent.
  mocks.getDb.mockReturnValue({
    select: () => ({
      from: () => ({ innerJoin: () => ({ innerJoin: () => chain([]) }) }),
    }),
  });
  return { run, chapters, events, ledger, tx, from };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.write.mockResolvedValue(undefined);
});

describe("finalizeStep minimum manuscript length", () => {
  it("rejects the audit's six ten-word chapters before any completion writes", async () => {
    const db = database({ chapters: Array.from({ length: 6 }, (_, i) => chapter(i + 1, 10)) });

    await expect(finalizeStep(ref)).rejects.toThrow(
      "Cannot finalize: expected 6 complete chapters, found 0",
    );
    expect(db.tx.update).not.toHaveBeenCalled();
    expect(db.tx.insert).not.toHaveBeenCalled();
    expect(db.run.status).toBe("running");
    expect(db.chapters.every((row) => row.status !== "final")).toBe(true);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.sendBookFinishedEmail).not.toHaveBeenCalled();
  });

  it.each([
    { words: 249, recorded: 249 },
    { words: 10, recorded: 1_000 },
    { words: 1_000, recorded: 249 },
    { words: 0, recorded: 1_000 },
  ])(
    "rejects a chapter with $words actual words and $recorded recorded words",
    async ({ words, recorded }) => {
      const rows = Array.from({ length: 6 }, (_, i) => chapter(i + 1, 1_000));
      rows[2] = { ...chapter(3, words), wordCount: recorded };
      const db = database({ chapters: rows });

      await expect(finalizeStep(ref)).rejects.toBeInstanceOf(FatalError);
      expect(db.tx.update).not.toHaveBeenCalled();
      expect(db.tx.insert).not.toHaveBeenCalled();
    },
  );

  it("finalizes every expected chapter at exactly one quarter of target", async () => {
    const db = database({ chapters: Array.from({ length: 6 }, (_, i) => chapter(i + 1, 250)) });
    const degraded = [
      { stage: "continuity", code: "continuity_review_unavailable", reason: "Unavailable" },
    ] as const;

    await finalizeStep(ref, "Finished", degraded);

    expect(db.run.status).toBe("completed");
    expect(db.chapters.every((row) => row.status === "final")).toBe(true);
    expect(db.run.config.completion?.finalized).toEqual({
      sourceRunId: ref.dbRunId,
      manuscriptDigest: manuscriptDigest(db.chapters),
    });
    expect(db.run.config.completion?.degraded).toEqual([expect.objectContaining(degraded[0])]);
    expect(db.events).toEqual([
      expect.objectContaining({
        seq: 7,
        eventKey: "finalize-1:done",
        payload: { type: "stage", stage: "done", pct: 100, detail: "Finished" },
      }),
    ]);
    expect(db.ledger).toEqual([
      expect.objectContaining({ externalRef: "reservation-close-request:run-1", amount: "0" }),
    ]);
    expect(mocks.write).toHaveBeenCalledOnce();
  });

  it("uses each persisted outline target, with the run target for missing entries", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => chapter(i + 1, 250));
    rows[0] = chapter(1, 200); // 25% of the smaller outline target.
    rows[1] = chapter(2, 299); // Below 25% of the larger outline target.
    const db = database({
      chapters: rows,
      outlineTargets: [
        { number: 1, targetWords: 800 },
        { number: 2, targetWords: 1_200 },
      ],
    });

    await expect(finalizeStep(ref)).rejects.toThrow("found 5");
    expect(db.tx.update).not.toHaveBeenCalled();
    rows[1] = chapter(2, 300);
    await expect(finalizeStep(ref)).resolves.toBeUndefined();
    expect(db.run.status).toBe("completed");
  });

  it("rounds fractional quarter-targets up without changing the writer's cutoff", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => chapter(i + 1, 250));
    const db = database({
      chapters: rows,
      config: { ...baseConfig, targetWordsPerChapter: 1_001 },
    });
    await expect(finalizeStep(ref)).rejects.toThrow("found 0");
    rows.forEach((row, i) => Object.assign(row, chapter(i + 1, 251)));
    await finalizeStep(ref);
    expect(db.run.status).toBe("completed");
  });

  it("completes a resumed manuscript with saved drafted, edited, and final chapters", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => chapter(i + 1, 1_000));
    rows[0].status = "final";
    const db = database({
      chapters: rows,
      config: { ...baseConfig, resumeFromRunId: "prior-run" },
    });
    await finalizeStep(ref);
    expect(db.run.status).toBe("completed");
    expect(db.chapters.every((row) => row.status === "final")).toBe(true);
  });

  it("does not count surplus chapters in place of an undersized expected chapter", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => chapter(i + 1, 1_000));
    rows[5] = chapter(6, 10);
    const db = database({ chapters: rows });
    await expect(finalizeStep(ref)).rejects.toThrow("found 5");
    expect(db.tx.update).not.toHaveBeenCalled();
  });
});

describe("finalizeStep terminal boundaries", () => {
  it.each([
    { status: "running", cancellationRequestedAt: new Date() },
    { status: "cancelled", cancellationRequestedAt: null },
  ])("preserves cancellation for $status runs", async (options) => {
    const db = database(options);
    await expect(finalizeStep(ref)).rejects.toThrow("Authoring cancellation requested");
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.tx.update).not.toHaveBeenCalled();
    expect(db.tx.insert).not.toHaveBeenCalled();
  });

  it("preserves failed runs", async () => {
    const db = database({ status: "failed" });
    await expect(finalizeStep(ref)).rejects.toBeInstanceOf(FatalError);
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.tx.update).not.toHaveBeenCalled();
  });

  it("replays committed finalization without revalidating or duplicating durable writes", async () => {
    const db = database();
    await finalizeStep(ref);
    const config = db.run.config;
    const writes = db.tx.update.mock.calls.length;
    const inserts = db.tx.insert.mock.calls.length;
    // Later edits and cancellation cannot undo the committed completion proof.
    db.chapters[0].content = "Shortened later.";
    db.chapters[0].wordCount = 2;
    db.run.cancellationRequestedAt = new Date();
    db.from.mockClear();

    await finalizeStep(ref);

    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.run.config).toBe(config);
    expect(db.tx.update).toHaveBeenCalledTimes(writes);
    expect(db.tx.insert).toHaveBeenCalledTimes(inserts);
    expect(db.events).toHaveLength(1);
    expect(db.ledger).toHaveLength(1);
  });

  it("keeps an existing durable done event on retry", async () => {
    const db = database({ existingDone: true });
    await finalizeStep(ref);
    expect(db.events).toHaveLength(1);
    expect(db.run.nextEventSeq).toBe(7);
    expect(db.run.status).toBe("completed");
  });

  it("keeps completion committed when publishing the done event fails", async () => {
    const db = database();
    mocks.write.mockRejectedValueOnce(new Error("Stream disconnected"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(finalizeStep(ref)).resolves.toBeUndefined();
      expect(db.run.status).toBe("completed");
      expect(db.run.config.completion?.finalized?.manuscriptDigest).toBeTruthy();
      expect(db.events).toHaveLength(1);
      expect(db.ledger).toHaveLength(1);
    } finally {
      warning.mockRestore();
    }
  });
});

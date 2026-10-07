import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  selections: [] as Record<string, unknown>[],
  rows: [] as unknown[],
}));

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: mocks.getDb,
}));

import { buildToolset } from "./index";

const ctx = { userId: "user_1", projectId: "proj_1", bookId: "book_1", runId: "run_1" };

type Executable = { execute: (input: unknown, options: unknown) => Promise<unknown> };

beforeEach(() => {
  mocks.selections.length = 0;
  mocks.rows = [];
  const limit = vi.fn(async () => mocks.rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mocks.getDb.mockReturnValue({
    select: vi.fn((selection: Record<string, unknown>) => {
      mocks.selections.push(selection);
      return { from };
    }),
  });
});

describe("continuity toolset", () => {
  it("offers no issue-recording tool, since findings come back in the phase result", () => {
    const tools = buildToolset("continuity", ctx);
    expect(Object.keys(tools)).not.toContain("continuityRecordIssue");
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining(["chaptersGetText", "entityGet", "entitySearch"]),
    );
  });
});

describe("chaptersGetText", () => {
  it("slices the chapter in SQL instead of loading its full content", async () => {
    mocks.rows = [{ text: "the requested window", title: "The Salt Ledger" }];
    const tool = buildToolset("continuity", ctx).chaptersGetText as unknown as Executable;

    const result = await tool.execute(
      { number: 3, startChar: 100, endChar: 400 },
      { toolCallId: "call_1", messages: [] },
    );

    expect(result).toEqual({
      chapterNumber: 3,
      title: "The Salt Ledger",
      text: "the requested window",
    });
    expect(Object.keys(mocks.selections[0])).toEqual(["text", "title"]);
  });

  it("reports a missing chapter rather than an empty window", async () => {
    const tool = buildToolset("continuity", ctx).chaptersGetText as unknown as Executable;
    await expect(
      tool.execute({ number: 99 }, { toolCallId: "call_1", messages: [] }),
    ).resolves.toEqual({ error: "Chapter 99 not found" });
  });
});

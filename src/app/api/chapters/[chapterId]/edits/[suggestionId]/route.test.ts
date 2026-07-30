import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
  ownership: vi.fn(),
  chapter: vi.fn(),
  active: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireUser: mocks.requireUser };
});
vi.mock("@/db/queries/books", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/queries/books")>();
  return {
    ...actual,
    getChapterOwnership: mocks.ownership,
    getChapterById: mocks.chapter,
  };
});
vi.mock("@/lib/generation-runs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation-runs")>();
  return { ...actual, hasActiveAuthoringRun: mocks.active };
});

import { POST } from "./route";

const chapterId = "11111111-1111-4111-8111-111111111111";
const suggestionId = "22222222-2222-4222-8222-222222222222";
const suggestion = {
  id: suggestionId,
  chapterId,
  chapterVersion: 4,
  passType: "selection" as const,
  suggestionType: "selection",
  severity: "info" as const,
  anchor: { start: 4, end: 9, originalText: "brown" },
  suggestedText: "silver",
  explanation: "More vivid",
  status: "pending" as const,
  createdAt: new Date(),
};

function query<T>(rows: T[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function request() {
  return new Request("http://localhost/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "accept" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  mocks.ownership.mockResolvedValue({
    userId: "user-1",
    projectId: "project-1",
    bookId: "book-1",
    chapterId,
    chapterNumber: 1,
  });
  mocks.chapter.mockResolvedValue({
    id: chapterId,
    content: "The brown fox.",
    version: 4,
    wordCount: 3,
  });
  mocks.active.mockResolvedValue(false);
});

describe("suggestion acceptance mutation boundary", () => {
  it("returns 409 without entering the atomic splice while production is active", async () => {
    mocks.active.mockResolvedValue(true);
    const execute = vi.fn();
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue(query([suggestion])),
      execute,
    });

    const response = await POST(request(), {
      params: Promise.resolve({ chapterId, suggestionId }),
    });

    expect(response.status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses one guarded CTE so a CAS failure has no partial chapter/suggestion writes", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue(query([suggestion])),
      execute,
    });

    const response = await POST(request(), {
      params: Promise.resolve({ chapterId, suggestionId }),
    });

    expect(response.status).toBe(409);
    expect(execute).toHaveBeenCalledOnce();
    const statement = execute.mock.calls[0][0];
    const sql = new PgDialect().sqlToQuery(statement).sql;
    expect(sql).toContain("for update");
    expect(sql).toContain("updated_chapter as");
    expect(sql).toContain("insert into");
    expect(sql).toContain("applied_suggestion as");
    expect(sql).toContain("not exists");
  });

  it("reports a production-run race instead of mislabeling it as a chapter edit", async () => {
    mocks.active.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValue(query([suggestion])),
      execute,
    });

    const response = await POST(request(), {
      params: Promise.resolve({ chapterId, suggestionId }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Finish or stop the current run before applying suggestions",
    });
  });
});

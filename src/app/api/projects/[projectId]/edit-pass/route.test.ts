import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("workflow/api", () => ({ start: vi.fn() }));
vi.mock("@/workflows/edit-manuscript", () => ({ editManuscript: vi.fn() }));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  assertNotSuspended: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
  SuspendedError: class SuspendedError extends Error {},
}));

import { GET } from "./route";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

function query<T>(rows: T[]) {
  const chain: Record<string, unknown> = {};
  const next = () => chain;
  chain.from = vi.fn(next);
  chain.innerJoin = vi.fn(next);
  chain.where = vi.fn(next);
  chain.groupBy = vi.fn(next);
  chain.orderBy = vi.fn(next);
  chain.limit = vi.fn(next);
  chain.then = (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain as {
    from: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    then: Promise<T[]>["then"];
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "author-1" });
});

describe("GET manuscript edit pass", () => {
  it("returns pending review suggestions grouped by chapter for only the latest run", async () => {
    const projectQuery = query([{ id: PROJECT_ID }]);
    const runQuery = query([
      {
        id: RUN_ID,
        status: "completed",
        kind: "edit_pass",
        config: {
          editPass: {
            instruction: "Strengthen the ending",
            completion: {
              sourceRunId: RUN_ID,
              reviewedChapterCount: 4,
              suggestionCount: 3,
              completedAt: "2026-08-10T12:00:00.000Z",
            },
          },
        },
        workflowRunId: "workflow-1",
        error: null,
        createdAt: new Date("2026-08-10T11:00:00.000Z"),
        completedAt: new Date("2026-08-10T12:00:00.000Z"),
        acceptanceUncertainAt: null,
      },
    ]);
    const suggestionQuery = query([
      { chapterNumber: 2, title: "The Crossing", suggestionCount: 2 },
      { chapterNumber: 4, title: "Home Again", suggestionCount: 1 },
    ]);
    const select = vi
      .fn()
      .mockReturnValueOnce(projectQuery)
      .mockReturnValueOnce(runQuery)
      .mockReturnValueOnce(suggestionQuery);
    mocks.getDb.mockReturnValue({ select });

    const response = await GET(new Request("https://sopher.ai"), {
      params: Promise.resolve({ projectId: PROJECT_ID }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      run: { id: RUN_ID, status: "completed", instruction: "Strengthen the ending" },
      suggestionCount: 3,
      firstSuggestionChapter: 2,
      suggestionChapters: [
        { chapterNumber: 2, title: "The Crossing", suggestionCount: 2 },
        { chapterNumber: 4, title: "Home Again", suggestionCount: 1 },
      ],
    });

    const where = suggestionQuery.where.mock.calls[0]?.[0];
    const compiled = new PgDialect().sqlToQuery(where);
    expect(compiled.sql).toContain('"suggestions"."run_id"');
    expect(compiled.sql).toContain('"suggestions"."pass_type"');
    expect(compiled.sql).toContain('"suggestions"."status"');
    expect(compiled.sql).toContain('"books"."project_id"');
    expect(compiled.params).toEqual(
      expect.arrayContaining([RUN_ID, "review", "pending", PROJECT_ID]),
    );
    expect(suggestionQuery.groupBy).toHaveBeenCalledOnce();
  });
});

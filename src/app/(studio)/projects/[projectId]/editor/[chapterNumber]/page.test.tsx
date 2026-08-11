// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireUser: vi.fn(),
  getProjectWithBook: vi.fn(),
  getChapterWithContent: vi.fn(),
  getChapterList: vi.fn(),
  getJourney: vi.fn(),
  loaderProps: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: mocks.getDb };
});
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/db/queries/books", () => ({
  getProjectWithBook: mocks.getProjectWithBook,
  getChapterWithContent: mocks.getChapterWithContent,
  getChapterList: mocks.getChapterList,
}));
vi.mock("@/db/queries/authoring-journey", () => ({
  getAuthoringJourneySnapshot: mocks.getJourney,
}));
vi.mock("@/components/editor/editor-shell-loader", () => ({
  EditorShellLoader: (props: unknown) => {
    mocks.loaderProps(props);
    return <div>Scoped editor loaded</div>;
  },
}));
vi.mock("@/components/studio/incomplete-production-notice", () => ({
  incompleteProductionStatus: () => null,
}));

import EditorChapterPage from "./page";

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

const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "author-1" });
  mocks.getProjectWithBook.mockResolvedValue({
    project: { targetWordsPerChapter: 1_000 },
    book: { id: "book-1", title: "The Crossing" },
  });
  mocks.getChapterWithContent.mockResolvedValue({
    id: "chapter-1",
    chapterNumber: 1,
    title: "Departure",
    content: "Once upon a time.",
    version: 2,
  });
  mocks.getChapterList.mockResolvedValue([
    {
      id: "chapter-1",
      chapterNumber: 1,
      title: "Departure",
      wordCount: 4,
      status: "drafted",
    },
  ]);
  mocks.getJourney.mockResolvedValue(null);
});

describe("EditorChapterPage review-run scope", () => {
  it("validates the run ownership and queries only its pending review rows", async () => {
    const runQuery = query([{ id: runId }]);
    const suggestionQuery = query([
      {
        id: "suggestion-1",
        chapterId: "chapter-1",
        runId,
        chapterVersion: 2,
        passType: "review" as const,
        suggestionType: "structure",
        severity: "info" as const,
        anchor: { start: 0, end: 4, originalText: "Once" },
        suggestedText: "Long ago",
        explanation: "A concrete change",
        status: "pending" as const,
      },
    ]);
    mocks.getDb.mockReturnValue({
      select: vi.fn().mockReturnValueOnce(runQuery).mockReturnValueOnce(suggestionQuery),
    });

    render(
      await EditorChapterPage({
        params: Promise.resolve({ projectId, chapterNumber: "1" }),
        searchParams: Promise.resolve({ reviewRun: runId }),
      }),
    );

    expect(screen.getByText("Scoped editor loaded")).toBeVisible();
    expect(mocks.loaderProps).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewRunId: runId,
        initialSuggestions: [expect.objectContaining({ id: "suggestion-1", runId })],
      }),
    );

    const dialect = new PgDialect();
    const runWhere = dialect.sqlToQuery(runQuery.where.mock.calls[0][0]);
    expect(runWhere.params).toEqual(
      expect.arrayContaining([runId, projectId, "author-1", "edit_pass"]),
    );
    const suggestionWhere = dialect.sqlToQuery(suggestionQuery.where.mock.calls[0][0]);
    expect(suggestionWhere.params).toEqual(
      expect.arrayContaining(["chapter-1", "pending", runId, "review"]),
    );
  });
});

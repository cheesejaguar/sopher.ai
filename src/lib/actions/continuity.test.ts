import { beforeEach, describe, expect, it, vi } from "vitest";

const { TestSpendAccessError } = vi.hoisted(() => ({
  TestSpendAccessError: class TestSpendAccessError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertNotSuspended: vi.fn(),
  revalidatePath: vi.fn(),
  select: vi.fn(),
  isActionRateLimited: vi.fn(),
  getAuthoringStartSafetyBlock: vi.fn(),
  assertProjectSpendAccess: vi.fn(),
  getBalance: vi.fn(),
  insertQueuedAuthoringRun: vi.fn(),
  linkAuthoringRunWorkflow: vi.fn(),
  terminalizeAuthoringRun: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return { ...actual, getDb: () => ({ select: mocks.select }) };
});
vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  assertNotSuspended: mocks.assertNotSuspended,
  SuspendedError: class SuspendedError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/security/rate-limit", () => ({
  isActionRateLimited: mocks.isActionRateLimited,
  LIMITS: { bookStart: "book-start" },
}));
vi.mock("@/lib/authoring-start-safety", () => ({
  getAuthoringStartSafetyBlock: mocks.getAuthoringStartSafetyBlock,
}));
vi.mock("@/lib/project-spend-access", () => ({
  assertProjectSpendAccess: mocks.assertProjectSpendAccess,
  ProjectSpendAccessError: TestSpendAccessError,
}));
vi.mock("@/lib/billing/credits", () => ({ getBalance: mocks.getBalance }));
vi.mock("@/lib/generation-runs", () => ({
  insertQueuedAuthoringRun: mocks.insertQueuedAuthoringRun,
  linkAuthoringRunWorkflow: mocks.linkAuthoringRunWorkflow,
  terminalizeAuthoringRun: mocks.terminalizeAuthoringRun,
  RunRequestKeyMismatchError: class RunRequestKeyMismatchError extends Error {},
  TrialOptionalWorkInProgressError: class TrialOptionalWorkInProgressError extends Error {},
}));
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("@/workflows/review-continuity", () => ({ reviewManuscriptContinuity: () => {} }));

import { startConsistencyReview } from "./continuity";

const PROJECT_ID = "3f7d3a2e-0000-4000-8000-000000000001";
const REQUEST_KEY = "3f7d3a2e-0000-4000-8000-000000000002";

const project = {
  id: PROJECT_ID,
  userId: "user-1",
  title: "The Lantern Coast",
  brief: "A brief",
  genre: "fantasy",
  styleGuide: null,
  experience: "full_book" as const,
  targetChapters: 3,
  targetWordsPerChapter: 2500,
  settings: { qualityTier: "standard" as const },
};

/**
 * Resolves each awaited query builder with the next queued result, so a test
 * describes what the database returns rather than which chain of methods the
 * action happened to call to get there.
 */
function queueQueries(results: unknown[][]) {
  let index = 0;
  mocks.select.mockImplementation(() => {
    const node: Record<string, unknown> = {};
    for (const method of ["from", "where", "innerJoin", "orderBy", "limit"]) {
      node[method] = () => node;
    }
    node.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(results[index++] ?? []).then(resolve, reject);
    return node;
  });
}

function writtenChapter(chapterNumber: number) {
  return {
    chapterNumber,
    status: "final" as const,
    content: "Prose that exists.",
    wordCount: 900,
    qualityScore: "0.8",
  };
}

const completedBookRun = [
  { config: { tier: "standard", targetChapters: 3, targetWordsPerChapter: 2500 } },
];

/** project -> replay -> source run -> book -> chapters */
function healthyProject(chapters = [writtenChapter(1), writtenChapter(2), writtenChapter(3)]) {
  queueQueries([[project], [], completedBookRun, [{ id: "book-1" }], chapters]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-1" });
  mocks.assertNotSuspended.mockResolvedValue(undefined);
  mocks.isActionRateLimited.mockResolvedValue(false);
  mocks.getAuthoringStartSafetyBlock.mockResolvedValue(null);
  mocks.assertProjectSpendAccess.mockResolvedValue({});
  mocks.getBalance.mockResolvedValue(10_000);
  mocks.insertQueuedAuthoringRun.mockResolvedValue({ id: "run-1", inserted: true });
  mocks.linkAuthoringRunWorkflow.mockResolvedValue(true);
  mocks.start.mockResolvedValue({ runId: "wf-1" });
});

describe("startConsistencyReview", () => {
  it("starts a continuity run and hands it to the durable workflow", async () => {
    healthyProject();

    const result = await startConsistencyReview({
      projectId: PROJECT_ID,
      requestKey: REQUEST_KEY,
    });

    expect(result).toEqual({ status: "started", runId: "run-1" });
    const insert = mocks.insertQueuedAuthoringRun.mock.calls[0]?.[0];
    expect(insert).toMatchObject({
      projectId: PROJECT_ID,
      userId: "user-1",
      kind: "continuity",
      requestKey: REQUEST_KEY,
    });
    // The delivered book's production shape, and no inherited checkpoints: a
    // carried-over report would let this run publish a score it never computed.
    expect(insert.config).toMatchObject({ tier: "standard", targetChapters: 3 });
    expect(insert.config.completion).toBeUndefined();
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.terminalizeAuthoringRun).not.toHaveBeenCalled();
  });

  it("refuses a book whose chapters are not all written", async () => {
    healthyProject([writtenChapter(1), writtenChapter(2)]);

    const result = await startConsistencyReview({
      projectId: PROJECT_ID,
      requestKey: REQUEST_KEY,
    });

    expect(result.status).toBe("refused");
    expect(result).toMatchObject({ message: expect.stringMatching(/every chapter/i) });
    expect(mocks.insertQueuedAuthoringRun).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("will not start against a project with unresolved metering", async () => {
    healthyProject();
    mocks.getAuthoringStartSafetyBlock.mockResolvedValue({
      code: "support_required",
      supportReference: "SUP-42",
      action: { description: "A prior provider attempt has unresolved billing evidence." },
    });

    const result = await startConsistencyReview({
      projectId: PROJECT_ID,
      requestKey: REQUEST_KEY,
    });

    expect(result).toMatchObject({
      status: "refused",
      message: expect.stringContaining("SUP-42"),
    });
    // The guard has to run before spend is authorized, not alongside it.
    expect(mocks.assertProjectSpendAccess).not.toHaveBeenCalled();
    expect(mocks.insertQueuedAuthoringRun).not.toHaveBeenCalled();
  });

  it("refuses while another run owns the project", async () => {
    healthyProject();
    mocks.assertProjectSpendAccess.mockRejectedValue(
      new TestSpendAccessError("trial_busy", "Finish the current authoring run first"),
    );

    const result = await startConsistencyReview({
      projectId: PROJECT_ID,
      requestKey: REQUEST_KEY,
    });

    expect(result).toEqual({
      status: "refused",
      message: "Finish the current authoring run first",
    });
    expect(mocks.insertQueuedAuthoringRun).not.toHaveBeenCalled();
  });

  it("quotes the whole review before starting it", async () => {
    healthyProject();
    mocks.getBalance.mockResolvedValue(0);

    const result = await startConsistencyReview({
      projectId: PROJECT_ID,
      requestKey: REQUEST_KEY,
    });

    expect(result.status).toBe("insufficient_credits");
    if (result.status !== "insufficient_credits") throw new Error("unreachable");
    expect(result.balance).toBe(0);
    // Six rubric phases at standard tier, so the quote covers all of them.
    expect(result.required).toBeGreaterThan(0);
    expect(mocks.insertQueuedAuthoringRun).not.toHaveBeenCalled();
  });

  it("fails the run when the workflow is not accepted, so the project is not left blocked", async () => {
    healthyProject();
    mocks.start.mockRejectedValue(new Error("dispatch refused"));

    const result = await startConsistencyReview({
      projectId: PROJECT_ID,
      requestKey: REQUEST_KEY,
    });

    expect(result.status).toBe("refused");
    expect(result).toMatchObject({ message: expect.stringMatching(/no credits were used/i) });
    expect(mocks.terminalizeAuthoringRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", status: "failed", releaseImmediately: true }),
    );
    // The provider-facing message never reaches the author.
    expect(result).not.toMatchObject({ message: expect.stringContaining("dispatch refused") });
  });

  it("replays a request key instead of starting a second review", async () => {
    queueQueries([[project], [{ id: "run-earlier", kind: "continuity" }]]);

    const result = await startConsistencyReview({
      projectId: PROJECT_ID,
      requestKey: REQUEST_KEY,
    });

    expect(result).toEqual({ status: "reattached", runId: "run-earlier" });
    expect(mocks.isActionRateLimited).not.toHaveBeenCalled();
    expect(mocks.insertQueuedAuthoringRun).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("does not leak another user's project", async () => {
    queueQueries([[]]);

    const result = await startConsistencyReview({
      projectId: PROJECT_ID,
      requestKey: REQUEST_KEY,
    });

    expect(result).toEqual({ status: "refused", message: "Project not found" });
    expect(mocks.insertQueuedAuthoringRun).not.toHaveBeenCalled();
  });
});

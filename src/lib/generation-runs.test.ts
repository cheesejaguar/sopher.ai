import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  getSqlClient: vi.fn(),
  getDb: vi.fn(),
  withDbTransaction: vi.fn(),
  transaction: vi.fn(),
  releaseRun: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return {
    ...actual,
    getSqlClient: mocks.getSqlClient,
    getDb: mocks.getDb,
    withDbTransaction: mocks.withDbTransaction,
  };
});

vi.mock("@/lib/billing/credits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/credits")>();
  return {
    ...actual,
    releaseRunCreditReservations: mocks.releaseRun,
  };
});

import {
  claimUncertainAuthoringRun,
  deriveAuthoringRunAcceptanceState,
  FullBookStartInsufficientCreditsError,
  insertQueuedAuthoringRun,
  linkAuthoringRunWorkflow,
  markAuthoringRunAcceptanceUncertain,
  ProjectStartSnapshotChangedError,
  settleStubbedAuthoringRunHandoff,
  terminalizeAuthoringRun,
  TrialOptionalWorkInProgressError,
} from "./generation-runs";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSqlClient.mockReturnValue({ transaction: mocks.transaction });
  mocks.releaseRun.mockResolvedValue(1);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function terminalDb(input: {
  status: "completed" | "failed" | "cancelled";
  hasWrittenChapter?: boolean;
  markerError?: Error;
}) {
  const execute = vi.fn().mockResolvedValue([]);
  const markerInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    }),
  });
  const nestedTransaction = vi.fn(
    async (work: (savepoint: { insert: typeof markerInsert }) => Promise<unknown>) => {
      if (input.markerError) throw input.markerError;
      return work({ insert: markerInsert });
    },
  );
  const projectSet = vi.fn();
  const runSet = vi.fn();
  const update = vi
    .fn()
    .mockImplementationOnce(() => ({
      set: (values: unknown) => {
        runSet(values);
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ status: input.status }]),
          }),
        };
      },
    }))
    .mockImplementationOnce(() => ({
      set: (values: unknown) => {
        projectSet(values);
        return { where: vi.fn().mockResolvedValue([]) };
      },
    }));
  const chapterRows = input.hasWrittenChapter ? [{ id: "chapter-1" }] : [];
  const limit = vi.fn().mockResolvedValue(chapterRows);
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit }),
      }),
    }),
  });
  const tx = { execute, transaction: nestedTransaction, update, select };
  mocks.withDbTransaction.mockImplementation(
    async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  );
  return { execute, nestedTransaction, update, runSet, projectSet };
}

describe("insertQueuedAuthoringRun", () => {
  it("serializes run creation with structural mutations in one transaction", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      expect(queries).toHaveLength(3);
      expect(queries[0].strings.join("?")).toContain("pg_advisory_xact_lock");
      expect(queries[1].strings.join("?")).toContain(
        "Repair optional operation lease from durable project output",
      );
      expect(queries[1].strings.join("?")).toContain("assets");
      expect(queries[1].strings.join("?")).toContain("content_tool_runs");
      expect(queries[1].strings.join("?")).toContain("suggestions");
      const insertSql = queries[2].strings.join("?");
      expect(insertSql).toContain("insert into generation_runs");
      expect(insertSql).toContain("on conflict (project_id, request_key)");
      expect(insertSql).toContain("acceptance_uncertain_at");
      expect(insertSql).toContain("acceptance_dispatch_claimed_at");
      expect(insertSql).toMatch(/\?::jsonb,\s+null,\s+now\(\)/);
      expect(insertSql).not.toMatch(/\?::jsonb,\s+now\(\),\s+now\(\)/);
      expect(insertSql).toContain("optional_intent");
      expect(insertSql).toContain("optional-operation-lease:");
      expect(insertSql).toContain("intent-settled:");
      expect(queries[2].values).toContain("33333333-3333-4333-8333-333333333333");
      return [
        [],
        [],
        [
          {
            id: "run-1",
            inserted: true,
            kind: "full_book",
            config: { tier: "standard" },
            status: "queued",
            workflow_run_id: null,
          },
        ],
      ];
    });

    await expect(
      insertQueuedAuthoringRun({
        projectId: "project-1",
        userId: "user-1",
        kind: "full_book",
        config: { tier: "standard" },
        requestKey: "33333333-3333-4333-8333-333333333333",
      }),
    ).resolves.toEqual({
      id: "run-1",
      inserted: true,
      kind: "full_book",
      config: { tier: "standard" },
      status: "queued",
      workflowRunId: null,
    });
  });

  it("reattaches an idempotent request instead of creating another run", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({
        strings,
        values,
      });
      build(tx);
      return [
        [],
        [],
        [
          {
            id: "run-existing",
            inserted: false,
            kind: "full_book",
            config: { tier: "standard" },
            status: "running",
            workflow_run_id: "wrun-existing",
          },
        ],
      ];
    });

    await expect(
      insertQueuedAuthoringRun({
        projectId: "project-1",
        userId: "user-1",
        kind: "full_book",
        config: { tier: "standard" },
        requestKey: "33333333-3333-4333-8333-333333333333",
      }),
    ).resolves.toEqual({
      id: "run-existing",
      inserted: false,
      kind: "full_book",
      config: { tier: "standard" },
      status: "running",
      workflowRunId: "wrun-existing",
    });
  });

  it("atomically rejects a request key concurrently persisted for another run kind", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({
        strings,
        values,
      });
      build(tx);
      return [
        [],
        [],
        [
          {
            id: "run-chapter",
            inserted: false,
            kind: "chapter",
            config: { chapterRegeneration: true },
            status: "queued",
            workflow_run_id: null,
          },
        ],
      ];
    });

    await expect(
      insertQueuedAuthoringRun({
        projectId: "project-1",
        userId: "user-1",
        kind: "full_book",
        config: { tier: "standard" },
        requestKey: "33333333-3333-4333-8333-333333333333",
      }),
    ).rejects.toThrow("belongs to chapter");
  });

  it("does not start production while a trial optional-tool intent is unresolved", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({
        strings,
        values,
      });
      build(tx);
      return [[], [], []];
    });

    await expect(
      insertQueuedAuthoringRun({
        projectId: "project-1",
        userId: "user-1",
        kind: "full_book",
        config: { tier: "standard" },
        requestKey: "33333333-3333-4333-8333-333333333333",
      }),
    ).rejects.toBeInstanceOf(TrialOptionalWorkInProgressError);
  });

  it("locks the wallet and refuses an underfunded full-book run before insertion", async () => {
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      expect(queries).toHaveLength(5);
      expect(queries[0].strings.join("?")).toContain("sopher:project-authoring:");
      expect(queries[1].strings.join("?")).toContain("pg_advisory_xact_lock");
      expect(queries[2].strings.join("?")).toContain("sum(amount)");
      expect(queries[4].strings.join("?")).toContain("wallet.user_id");
      return [[], [], [{ balance: "3.5" }], [], []];
    });

    await expect(
      insertQueuedAuthoringRun({
        projectId: "project-1",
        userId: "user-1",
        kind: "full_book",
        config: { tier: "standard" },
        requestKey: "33333333-3333-4333-8333-333333333333",
        minimumBalanceCredits: 8,
      }),
    ).rejects.toEqual(new FullBookStartInsufficientCreditsError(3.5, 8));
  });

  it("refuses a stale full-book shape before its old funding estimate can create a run", async () => {
    const expectedUpdatedAt = new Date("2026-07-30T12:00:00.000Z");
    mocks.transaction.mockImplementation(async (build) => {
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
      const queries = build(tx);
      expect(queries).toHaveLength(6);
      expect(queries[3].strings.join("?")).toContain('updated_at as "updatedAt"');
      const insertSql = queries[5].strings.join("?");
      expect(insertSql).toContain("project_snapshot.updated_at");
      expect(insertSql).toContain("project_snapshot.target_chapters");
      expect(insertSql).toContain("project_snapshot.target_words_per_chapter");
      return [
        [],
        [],
        [{ balance: "50" }],
        [
          {
            updatedAt: new Date("2026-07-30T12:00:01.000Z"),
            targetChapters: 24,
            targetWordsPerChapter: 2_000,
            experience: "full_book",
          },
        ],
        [],
        [],
      ];
    });

    await expect(
      insertQueuedAuthoringRun({
        projectId: "project-1",
        userId: "user-1",
        kind: "full_book",
        config: { tier: "standard", targetChapters: 12, targetWordsPerChapter: 1_500 },
        requestKey: "33333333-3333-4333-8333-333333333333",
        minimumBalanceCredits: 8,
        expectedProjectSnapshot: {
          updatedAt: expectedUpdatedAt,
          targetChapters: 12,
          targetWordsPerChapter: 1_500,
          experience: "full_book",
        },
      }),
    ).rejects.toBeInstanceOf(ProjectStartSnapshotChangedError);
  });

  it("locks project then wallet, closes claims, and terminalizes atomically", async () => {
    const { execute, nestedTransaction, update, runSet, projectSet } = terminalDb({
      status: "failed",
      hasWrittenChapter: true,
    });

    await terminalizeAuthoringRun({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      status: "failed",
      error: "workflow start failed",
      releaseImmediately: true,
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(execute.mock.invocationCallOrder[1]);
    expect(execute.mock.invocationCallOrder[1]).toBeLessThan(
      nestedTransaction.mock.invocationCallOrder[0],
    );
    expect(nestedTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0],
    );
    expect(runSet).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptanceUncertainAt: null,
        acceptanceDispatchClaimedAt: null,
      }),
    );
    expect(projectSet).toHaveBeenCalledWith(expect.objectContaining({ status: "editing" }));
    expect(mocks.releaseRun).toHaveBeenCalledWith({ runId: "run-1", userId: "user-1" });
  });

  it("still writes terminal state under the wallet lock if close-marker persistence fails", async () => {
    const { update, projectSet } = terminalDb({
      status: "cancelled",
      markerError: new Error("close marker unavailable"),
    });

    await terminalizeAuthoringRun({
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      status: "cancelled",
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(projectSet).toHaveBeenCalledWith(expect.objectContaining({ status: "draft" }));
    expect(mocks.releaseRun).not.toHaveBeenCalled();
  });
});

describe("Workflow dispatch ownership", () => {
  function mockUpdateReturning(rows: unknown[]) {
    const returning = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    mocks.getDb.mockReturnValue({ update });
    return { update, set, where, returning };
  }

  it("links one active run and clears both uncertain-dispatch fields", async () => {
    const query = mockUpdateReturning([{ id: "run-1" }]);

    await expect(
      linkAuthoringRunWorkflow({
        runId: "run-1",
        projectId: "project-1",
        userId: "user-1",
        workflowRunId: "workflow-1",
      }),
    ).resolves.toBe(true);

    expect(query.set).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: "workflow-1",
        acceptanceUncertainAt: null,
        acceptanceDispatchClaimedAt: null,
        heartbeatAt: expect.any(Date),
      }),
    );
  });

  it("distinguishes a normal initial dispatch from an ambiguous response", () => {
    const now = new Date("2026-07-30T12:10:00.000Z");

    expect(
      deriveAuthoringRunAcceptanceState(
        {
          acceptanceUncertainAt: null,
          acceptanceDispatchClaimedAt: new Date("2026-07-30T12:09:30.000Z"),
        },
        now,
      ),
    ).toEqual({
      acceptanceUncertain: false,
      dispatchClaimIsFresh: true,
      safeToRetry: false,
    });
    expect(
      deriveAuthoringRunAcceptanceState(
        {
          acceptanceUncertainAt: new Date("2026-07-30T12:09:30.000Z"),
          acceptanceDispatchClaimedAt: null,
        },
        now,
      ),
    ).toEqual({
      acceptanceUncertain: true,
      dispatchClaimIsFresh: false,
      safeToRetry: true,
    });
  });

  it("makes an abandoned initial dispatch lease retryable after it expires", () => {
    expect(
      deriveAuthoringRunAcceptanceState(
        {
          acceptanceUncertainAt: null,
          acceptanceDispatchClaimedAt: new Date("2026-07-30T12:07:59.000Z"),
        },
        new Date("2026-07-30T12:10:00.000Z"),
      ),
    ).toEqual({
      acceptanceUncertain: true,
      dispatchClaimIsFresh: false,
      safeToRetry: true,
    });
  });

  it("reports a lost linkage CAS instead of overwriting another Workflow owner", async () => {
    mockUpdateReturning([]);

    await expect(
      linkAuthoringRunWorkflow({
        runId: "run-1",
        projectId: "project-1",
        userId: "user-1",
        workflowRunId: "workflow-loser",
      }),
    ).resolves.toBe(false);
  });

  it("keeps the durable uncertainty marker while claiming one retry", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const returning = vi.fn().mockResolvedValue([
      {
        id: "run-1",
        projectId: "project-1",
        userId: "user-1",
        kind: "full_book",
        config: { tier: "standard" },
      },
    ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const tx = { execute, update };
    mocks.withDbTransaction.mockImplementation(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await expect(
      claimUncertainAuthoringRun({
        runId: "run-1",
        projectId: "project-1",
        userId: "user-1",
      }),
    ).resolves.toEqual({
      id: "run-1",
      projectId: "project-1",
      userId: "user-1",
      kind: "full_book",
      config: { tier: "standard" },
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptanceUncertainAt: expect.any(Date),
        acceptanceDispatchClaimedAt: expect.any(Date),
        dispatchAttempts: expect.anything(),
      }),
    );
    const predicate = where.mock.calls[0]?.[0] as { getSQL: () => unknown };
    const sqlText = new PgDialect().sqlToQuery(predicate.getSQL() as never).sql;
    expect(sqlText).toContain('"generation_runs"."cancellation_requested_at" is null');
  });

  it("re-arms an ambiguous response without terminalizing the queued run", async () => {
    const query = mockUpdateReturning([{ id: "run-1" }]);

    await expect(
      markAuthoringRunAcceptanceUncertain({
        runId: "run-1",
        projectId: "project-1",
        userId: "user-1",
      }),
    ).resolves.toBe(true);
    expect(query.set).toHaveBeenCalledWith({
      acceptanceUncertainAt: expect.any(Date),
    });
  });

  it("clears dispatch ambiguity for an explicitly isolated accepted E2E stub", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_DATABASE_ISOLATED", "1");
    vi.stubEnv("E2E_STUB_WORKFLOW", "1");
    vi.stubEnv("E2E_DATABASE_HOST", "isolated.example.test");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@isolated.example.test/test");
    vi.stubEnv("VERCEL_ENV", "");
    const query = mockUpdateReturning([{ id: "run-1" }]);

    await expect(
      settleStubbedAuthoringRunHandoff({
        runId: "run-1",
        projectId: "project-1",
        userId: "user-1",
      }),
    ).resolves.toBe(true);
    expect(query.set).toHaveBeenCalledWith({
      acceptanceUncertainAt: null,
      acceptanceDispatchClaimedAt: null,
    });
  });
});

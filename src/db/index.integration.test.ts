import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { schema, withDbTransaction } from "./index";
import {
  persistContentToolDeliveryTransaction,
  persistCoverDeliveryTransaction,
  persistDiagramAssetsTransaction,
  persistExportAssetTransaction,
  persistPortraitDeliveryTransaction,
  projectExistsUnderAuthoringLock,
  referencedAssetPathnamesUnderAuthoringLock,
  replaceCoverAssetTransaction,
  replacePortraitAssetTransaction,
} from "./transaction-operations";
import { claimUncertainAuthoringRun, transitionAuthoringRunState } from "@/lib/generation-runs";
import {
  deleteProjectTransaction,
  refreshProjectBeforeFirstRunTransaction,
  setProjectArchivedTransaction,
  updateProjectTransaction,
} from "@/lib/project-transaction-operations";
import { deleteClerkUserTransaction } from "@/lib/account-deletion-transaction";
import {
  beginMeteredCallIntent,
  recordLlmCallsAndDebit,
  refundSettledLogicalUsageForRedo,
} from "@/lib/billing/meter";
import {
  optionalDeliveryLeasePrefix,
  optionalDeliveryReceiptRef,
} from "@/lib/billing/optional-delivery";
import { captureExportSnapshot } from "@/lib/export/assemble";
import { validFullBookCompletionExistsSql } from "@/lib/run-completion-proof";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  const requested = isolated === "1" || Boolean(value);
  if (!requested) return null;

  if (isolated !== "1") {
    throw new Error("Refusing transaction integration tests without E2E_DATABASE_ISOLATED=1.");
  }
  if (!value) {
    throw new Error("E2E_DATABASE_URL must identify the disposable database branch.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing transaction integration tests in NODE_ENV=production.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("E2E_DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("E2E_DATABASE_URL must be a PostgreSQL connection URL with a hostname.");
  }
  const allowedHost = process.env.E2E_DATABASE_HOST?.trim();
  if (!allowedHost || parsed.hostname !== allowedHost) {
    throw new Error(
      "E2E_DATABASE_HOST must exactly match the disposable database branch hostname.",
    );
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

function firstRow<T>(result: unknown): T | undefined {
  return (result as T[])[0];
}

describeIsolated("withDbTransaction against isolated Neon", () => {
  let observer: ReturnType<typeof neon>;
  const suffix = randomUUID();
  const ids = {
    committed: `e2e-transaction-commit-${suffix}`,
    rolledBack: `e2e-transaction-rollback-${suffix}`,
    outer: `e2e-transaction-savepoint-outer-${suffix}`,
    nested: `e2e-transaction-savepoint-nested-${suffix}`,
    recovered: `e2e-transaction-savepoint-recovered-${suffix}`,
    pathUser: `e2e-transaction-path-${suffix}`,
    accountUser: `e2e-transaction-account-${suffix}`,
    baseProject: randomUUID(),
    baseBook: randomUUID(),
    baseChapter: randomUUID(),
    baseEntity: randomUUID(),
    oldPortraitAsset: randomUUID(),
    oldCoverAsset: randomUUID(),
    refreshProject: randomUUID(),
    refreshBook: randomUUID(),
    failedRefreshProject: randomUUID(),
    failedRefreshBook: randomUUID(),
    failedRefreshRun: randomUUID(),
    cancelledRefreshProject: randomUUID(),
    cancelledRefreshBook: randomUUID(),
    cancelledRefreshRun: randomUUID(),
    authoredRefreshProject: randomUUID(),
    authoredRefreshBook: randomUUID(),
    authoredRefreshRun: randomUUID(),
    completedRefreshProject: randomUUID(),
    completedRefreshBook: randomUUID(),
    completedRefreshRun: randomUUID(),
    deleteProject: randomUUID(),
    deleteAsset: randomUUID(),
    runProject: randomUUID(),
    firstRun: randomUUID(),
    uncertainRun: randomUUID(),
    accountProject: randomUUID(),
    accountAsset: randomUUID(),
  };
  const previousDatabaseUrl = process.env.DATABASE_URL;

  async function userExists(id: string): Promise<boolean> {
    const rows = await observer`select id from users where id = ${id}`;
    return Array.isArray(rows) && rows.length === 1;
  }

  async function createMeteringFixture(label: string) {
    const userId = `e2e-metering-${label}-${suffix}`;
    const projectId = randomUUID();
    const runId = randomUUID();
    await observer`
      insert into users (id, email)
      values (${userId}, ${`${userId}@example.test`})
    `;
    await observer`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, 'Metering fixture', 'An isolated metering fixture',
        'fantasy', 'trial_short_story', 3, 1000, '{}'::jsonb
      )
    `;
    await observer`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config
      )
      values (
        ${runId}, ${projectId}, ${userId}, ${randomUUID()},
        'full_book', 'running', '{"targetChapters":3}'::jsonb
      )
    `;
    await observer`
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, run_id, external_ref
      )
      values (
        ${userId}, 10, 'grant', 'Included story fixture',
        ${projectId}, ${runId}, ${`metering-grant:${label}:${suffix}`}
      )
    `;
    return { userId, projectId, runId };
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Isolated database URL disappeared before test setup.");
    process.env.DATABASE_URL = databaseUrl;
    observer = neon(databaseUrl);

    await observer`
      insert into users (id, email)
      values
        (${ids.pathUser}, ${`${ids.pathUser}@example.test`}),
        (${ids.accountUser}, ${`${ids.accountUser}@example.test`})
    `;
    await observer`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values
        (
          ${ids.baseProject}, ${ids.pathUser}, 'Path fixture', 'A transaction fixture brief',
          'fantasy', 'full_book', 3, 1000, '{}'::jsonb
        ),
        (
          ${ids.refreshProject}, ${ids.pathUser}, 'Before refresh', 'A refresh fixture brief',
          'mystery', 'full_book', 3, 1000, '{}'::jsonb
        ),
        (
          ${ids.failedRefreshProject}, ${ids.pathUser}, 'Failed start title',
          'Failed start brief', 'mystery', 'full_book', 3, 1000,
          '{"qualityTier":"draft"}'::jsonb
        ),
        (
          ${ids.cancelledRefreshProject}, ${ids.pathUser}, 'Cancelled start title',
          'Cancelled start brief', 'fantasy', 'full_book', 4, 1100,
          '{"qualityTier":"draft"}'::jsonb
        ),
        (
          ${ids.authoredRefreshProject}, ${ids.pathUser}, 'Authored title',
          'Authored brief', 'thriller', 'full_book', 5, 1200,
          '{"qualityTier":"standard"}'::jsonb
        ),
        (
          ${ids.completedRefreshProject}, ${ids.pathUser}, 'Completed title',
          'Completed brief', 'romance', 'full_book', 6, 1300,
          '{"qualityTier":"premium"}'::jsonb
        ),
        (
          ${ids.deleteProject}, ${ids.pathUser}, 'Delete fixture', 'A delete fixture brief',
          'thriller', 'full_book', 3, 1000, '{}'::jsonb
        ),
        (
          ${ids.runProject}, ${ids.pathUser}, 'Run fixture', 'A run fixture brief',
          'science-fiction', 'full_book', 3, 1000, '{}'::jsonb
        ),
        (
          ${ids.accountProject}, ${ids.accountUser}, 'Account fixture', 'An account fixture brief',
          'romance', 'full_book', 3, 1000, '{}'::jsonb
        )
    `;
    await observer`
      insert into books (id, project_id, title, front_matter)
      values
        (${ids.baseBook}, ${ids.baseProject}, 'Path fixture', ${JSON.stringify({
          coverUrl: "https://blob.test/old-cover.png",
          author: "Fixture Author",
        })}::jsonb),
        (${ids.refreshBook}, ${ids.refreshProject}, 'Before refresh', '{}'::jsonb),
        (${ids.failedRefreshBook}, ${ids.failedRefreshProject}, 'Failed start title', '{}'::jsonb),
        (
          ${ids.cancelledRefreshBook}, ${ids.cancelledRefreshProject},
          'Cancelled start title', '{}'::jsonb
        ),
        (${ids.authoredRefreshBook}, ${ids.authoredRefreshProject}, 'Authored title', '{}'::jsonb),
        (
          ${ids.completedRefreshBook}, ${ids.completedRefreshProject},
          'Completed title', '{}'::jsonb
        )
    `;
    await observer`
      insert into generation_runs (id, project_id, user_id, kind, status, config)
      values
        (
          ${ids.failedRefreshRun}, ${ids.failedRefreshProject}, ${ids.pathUser},
          'full_book', 'failed', '{}'::jsonb
        ),
        (
          ${ids.cancelledRefreshRun}, ${ids.cancelledRefreshProject}, ${ids.pathUser},
          'full_book', 'cancelled', '{}'::jsonb
        ),
        (
          ${ids.authoredRefreshRun}, ${ids.authoredRefreshProject}, ${ids.pathUser},
          'full_book', 'failed', '{}'::jsonb
        ),
        (
          ${ids.completedRefreshRun}, ${ids.completedRefreshProject}, ${ids.pathUser},
          'full_book', 'completed', '{}'::jsonb
        )
    `;
    await observer`
      insert into generation_events (run_id, seq, type, payload)
      values
        (${ids.failedRefreshRun}, 1, 'stage', '{"type":"stage","stage":"queued","pct":0}'::jsonb),
        (
          ${ids.authoredRefreshRun}, 1, 'stage',
          '{"type":"stage","stage":"concept","pct":5}'::jsonb
        )
    `;
    await observer`
      insert into chapters (
        id, book_id, chapter_number, title, content, word_count, status
      )
      values (
        ${ids.baseChapter}, ${ids.baseBook}, 1, 'Fixture chapter',
        'Fixture prose.', 2, 'drafted'
      )
    `;
    await observer`
      insert into assets (
        id, project_id, kind, blob_url, blob_pathname, content_type, size_bytes, meta
      )
      values
        (
          ${ids.oldPortraitAsset}, ${ids.baseProject}, 'portrait',
          'https://blob.test/old-portrait.png', 'fixtures/old-portrait.png',
          'image/png', 10, '{}'::jsonb
        ),
        (
          ${ids.oldCoverAsset}, ${ids.baseProject}, 'cover',
          'https://blob.test/old-cover.png', 'fixtures/old-cover.png',
          'image/png', 20, '{}'::jsonb
        ),
        (
          ${ids.deleteAsset}, ${ids.deleteProject}, 'cover',
          'https://blob.test/delete-cover.png', 'fixtures/delete-cover.png',
          'image/png', 30, '{"operationKey":"delete-cover-op"}'::jsonb
        ),
        (
          ${ids.accountAsset}, ${ids.accountProject}, 'cover',
          'https://blob.test/account-cover.png', 'fixtures/account-cover.png',
          'image/png', 40, '{"operationKey":"account-cover-op"}'::jsonb
        )
    `;
    await observer`
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, external_ref
      )
      values
        (
          ${ids.pathUser}, 0, 'adjustment', 'Delivered optional operation lease',
          ${ids.deleteProject},
          'optional-operation-lease:fixture:delete-cover-op:attempt:1'
        ),
        (
          ${ids.accountUser}, 0, 'adjustment', 'Delivered optional operation lease',
          ${ids.accountProject},
          'optional-operation-lease:fixture:account-cover-op:attempt:1'
        )
    `;
    await observer`
      insert into entities (
        id, book_id, kind, name, aliases, attrs, portrait_asset_id
      )
      values (
        ${ids.baseEntity}, ${ids.baseBook}, 'character', 'Fixture Character',
        '[]'::jsonb, '{"appearance":"silver hair"}'::jsonb, ${ids.oldPortraitAsset}
      )
    `;
  });

  afterAll(async () => {
    for (const id of [
      ids.committed,
      ids.rolledBack,
      ids.outer,
      ids.nested,
      ids.recovered,
      ids.pathUser,
      ids.accountUser,
    ]) {
      await observer`delete from users where id = ${id}`;
    }
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("commits an outer transaction and makes it visible to another connection", async () => {
    await withDbTransaction(async (tx) => {
      await tx.insert(schema.users).values({
        id: ids.committed,
        email: `${ids.committed}@example.test`,
      });
    });

    await expect(userExists(ids.committed)).resolves.toBe(true);
  });

  it("rolls back every write when the outer callback throws", async () => {
    const rollback = new Error("intentional outer rollback");

    await expect(
      withDbTransaction(async (tx) => {
        await tx.insert(schema.users).values({
          id: ids.rolledBack,
          email: `${ids.rolledBack}@example.test`,
        });
        throw rollback;
      }),
    ).rejects.toBe(rollback);

    await expect(userExists(ids.rolledBack)).resolves.toBe(false);
  });

  it("rolls back a nested savepoint while allowing the outer transaction to recover", async () => {
    await withDbTransaction(async (tx) => {
      await tx.insert(schema.users).values({
        id: ids.outer,
        email: `${ids.outer}@example.test`,
      });

      await expect(
        tx.transaction(async (savepoint) => {
          await savepoint.insert(schema.users).values({
            id: ids.nested,
            email: `${ids.nested}@example.test`,
          });
          throw new Error("intentional savepoint rollback");
        }),
      ).rejects.toThrow("intentional savepoint rollback");

      await tx.insert(schema.users).values({
        id: ids.recovered,
        email: `${ids.recovered}@example.test`,
      });
    });

    await expect(userExists(ids.outer)).resolves.toBe(true);
    await expect(userExists(ids.nested)).resolves.toBe(false);
    await expect(userExists(ids.recovered)).resolves.toBe(true);
  });

  it("captures an immutable incomplete export edition with exact chapter versions", async () => {
    const snapshot = await withDbTransaction(async (tx) => {
      await tx.execute(sql`set transaction isolation level repeatable read`);
      return captureExportSnapshot(tx, ids.pathUser, ids.baseProject);
    });

    expect(snapshot).toMatchObject({
      incomplete: true,
      chapterVersions: [{ number: 1, version: 1 }],
      manuscript: {
        title: "Path fixture",
        editionNote: "an incomplete production snapshot",
        chapters: [
          {
            number: 1,
            title: "Fixture chapter",
            markdown: "Fixture prose.",
          },
        ],
      },
    });

    await observer`
      update chapters
      set content = 'A later edit.', version = version + 1
      where id = ${ids.baseChapter}
    `;

    expect(snapshot?.manuscript.chapters[0]?.markdown).toBe("Fixture prose.");
    expect(snapshot?.chapterVersions).toEqual([{ number: 1, version: 1 }]);

    await observer`
      update chapters
      set content = 'Fixture prose.', version = 1
      where id = ${ids.baseChapter}
    `;
  });

  it("exports the completed manuscript after a shorter zero-work rerun fails", async () => {
    const projectId = randomUUID();
    const bookId = randomUUID();
    const completedRunId = randomUUID();
    const failedRunId = randomUUID();
    await observer`
      insert into projects (
        id, user_id, title, brief, genre, experience, target_chapters,
        target_words_per_chapter, settings, completed_at
      )
      values (
        ${projectId}, ${ids.pathUser}, 'Ten chapter proof', 'Completed export fixture',
        'fantasy', 'full_book', 3, 1000, '{}'::jsonb, now()
      )
    `;
    await observer`
      insert into books (id, project_id, title, front_matter)
      values (${bookId}, ${projectId}, 'Ten chapter proof', '{}'::jsonb)
    `;
    for (let chapterNumber = 1; chapterNumber <= 10; chapterNumber += 1) {
      await observer`
        insert into chapters (
          id, book_id, chapter_number, title, content, word_count, status
        )
        values (
          ${randomUUID()}, ${bookId}, ${chapterNumber}, ${`Chapter ${chapterNumber}`},
          ${`Completed prose ${chapterNumber}.`}, 3, 'final'
        )
      `;
    }
    await observer`
      insert into generation_runs (
        id, project_id, user_id, kind, status, config, created_at, completed_at
      )
      values (
        ${completedRunId}, ${projectId}, ${ids.pathUser}, 'full_book', 'completed',
        ${JSON.stringify({
          protocolVersion: 2,
          targetChapters: 10,
          manuscriptPrepared: true,
          completion: {
            finalized: {
              sourceRunId: completedRunId,
              manuscriptDigest: "ten-chapter-proof",
            },
          },
        })}::jsonb,
        now() - interval '1 minute', now() - interval '1 minute'
      )
    `;
    await observer`
      insert into generation_runs (
        id, project_id, user_id, kind, status, config, created_at, completed_at
      )
      values (
        ${failedRunId}, ${projectId}, ${ids.pathUser}, 'full_book', 'failed',
        '{"targetChapters":3}'::jsonb, now(), now()
      )
    `;

    const snapshot = await withDbTransaction((tx) =>
      captureExportSnapshot(tx, ids.pathUser, projectId),
    );

    expect(snapshot).toMatchObject({
      incomplete: false,
      manuscript: {
        editionNote: "an early reading copy",
      },
    });
    expect(snapshot?.manuscript.chapters).toHaveLength(10);
    expect(snapshot?.chapterVersions).toHaveLength(10);
  });

  it("exports a completed pinned-v1 manuscript without v2 finalization metadata", async () => {
    const projectId = randomUUID();
    const bookId = randomUUID();
    const runId = randomUUID();
    await observer`
      insert into projects (
        id, user_id, title, brief, genre, experience, target_chapters,
        target_words_per_chapter, settings, completed_at
      )
      values (
        ${projectId}, ${ids.pathUser}, 'Pinned v1 export',
        'Historical completed books retain export access.',
        'mystery', 'full_book', 1, 1000, '{}'::jsonb, now()
      )
    `;
    await observer`
      insert into books (id, project_id, title, front_matter)
      values (${bookId}, ${projectId}, 'Pinned v1 export', '{}'::jsonb)
    `;
    await observer`
      insert into chapters (
        id, book_id, chapter_number, title, content, word_count, status
      )
      values (
        ${randomUUID()}, ${bookId}, 1, 'Final',
        'Historical final prose.', 3, 'final'
      )
    `;
    await observer`
      insert into generation_runs (
        id, project_id, user_id, kind, status, config, created_at, completed_at
      )
      values (
        ${runId}, ${projectId}, ${ids.pathUser}, 'full_book', 'completed',
        '{"protocolVersion":1,"targetChapters":1}'::jsonb, now(), now()
      )
    `;

    const snapshot = await withDbTransaction((tx) =>
      captureExportSnapshot(tx, ids.pathUser, projectId),
    );

    expect(snapshot).toMatchObject({
      incomplete: false,
      manuscript: {
        editionNote: "an early reading copy",
      },
    });
    expect(snapshot?.manuscript.chapters).toHaveLength(1);
    expect(snapshot?.chapterVersions).toHaveLength(1);
  });

  it("requires source-bound v2 proof while retaining completed pinned-v1 books", async () => {
    const projectId = randomUUID();
    const bookId = randomUUID();
    const chapterId = randomUUID();
    const runId = randomUUID();
    await observer`
      insert into projects (
        id, user_id, title, brief, genre, experience, target_chapters,
        target_words_per_chapter, settings, completed_at
      )
      values (
        ${projectId}, ${ids.pathUser}, 'Completion proof', 'Completion proof fixture',
        'mystery', 'trial_short_story', 1, 1000, '{}'::jsonb, now()
      )
    `;
    await observer`
      insert into books (id, project_id, title, front_matter)
      values (${bookId}, ${projectId}, 'Completion proof', '{}'::jsonb)
    `;
    await observer`
      insert into chapters (
        id, book_id, chapter_number, title, content, word_count, status
      )
      values (${chapterId}, ${bookId}, 1, 'Proof', 'Final prose.', 2, 'final')
    `;
    await observer`
      insert into generation_runs (id, project_id, user_id, kind, status, config)
      values (
        ${runId}, ${projectId}, ${ids.pathUser}, 'full_book', 'completed',
        ${JSON.stringify({
          protocolVersion: 2,
          targetChapters: 1,
          completion: {
            finalized: {
              sourceRunId: randomUUID(),
              manuscriptDigest: "wrong-owner",
            },
          },
        })}::jsonb
      )
    `;

    const completionReady = async () => {
      const [row] = await withDbTransaction((tx) =>
        tx
          .select({ ready: validFullBookCompletionExistsSql(sql.raw('"projects"."id"')) })
          .from(schema.projects)
          .where(eq(schema.projects.id, projectId))
          .limit(1),
      );
      return row?.ready ?? false;
    };
    await expect(completionReady()).resolves.toBe(false);

    await observer`
      update generation_runs
      set config = ${JSON.stringify({
        protocolVersion: 2,
        targetChapters: 1,
        completion: {
          finalized: {
            sourceRunId: runId,
            manuscriptDigest: "source-bound-proof",
          },
        },
      })}::jsonb
      where id = ${runId}
    `;
    await expect(completionReady()).resolves.toBe(true);

    await observer`
      update chapters
      set content = '', word_count = 0, status = 'planned'
      where id = ${chapterId}
    `;
    await expect(completionReady()).resolves.toBe(true);

    await observer`
      update generation_runs
      set config = '{"protocolVersion":1,"targetChapters":1}'::jsonb
      where id = ${runId}
    `;
    await expect(completionReady()).resolves.toBe(true);
  });

  it("serializes archive with authoring and restores only source-bound completion", async () => {
    const projectId = randomUUID();
    const bookId = randomUUID();
    const chapterId = randomUUID();
    const completedRunId = randomUUID();
    const exportRunId = randomUUID();
    const activeRunId = randomUUID();
    await observer`
      insert into projects (
        id, user_id, title, brief, genre, experience, target_chapters,
        target_words_per_chapter, settings, status, completed_at
      )
      values (
        ${projectId}, ${ids.pathUser}, 'Archive proof', 'Archive state fixture',
        'mystery', 'full_book', 1, 1000, '{}'::jsonb, 'archived', now()
      )
    `;
    await observer`
      insert into books (id, project_id, title, front_matter)
      values (${bookId}, ${projectId}, 'Archive proof', '{}'::jsonb)
    `;
    await observer`
      insert into chapters (
        id, book_id, chapter_number, title, content, word_count, status
      )
      values (${chapterId}, ${bookId}, 1, 'Proof', 'Final-looking prose.', 2, 'final')
    `;
    await observer`
      insert into generation_runs (id, project_id, user_id, kind, status, config)
      values (
        ${completedRunId}, ${projectId}, ${ids.pathUser}, 'full_book', 'completed',
        ${JSON.stringify({
          protocolVersion: 2,
          targetChapters: 1,
          completion: {
            finalized: {
              sourceRunId: randomUUID(),
              manuscriptDigest: "wrong-owner",
            },
          },
        })}::jsonb
      )
    `;

    await expect(
      withDbTransaction((tx) =>
        setProjectArchivedTransaction(tx, {
          projectId,
          userId: ids.pathUser,
          archived: false,
        }),
      ),
    ).resolves.toBe("updated");
    let [project] = (await observer`
      select status from projects where id = ${projectId}
    `) as unknown as Array<{ status: string }>;
    expect(project?.status).toBe("editing");

    await observer`
      insert into generation_runs (id, project_id, user_id, kind, status, config)
      values (
        ${exportRunId}, ${projectId}, ${ids.pathUser},
        'export', 'running', '{}'::jsonb
      )
    `;
    await expect(
      withDbTransaction((tx) =>
        setProjectArchivedTransaction(tx, {
          projectId,
          userId: ids.pathUser,
          archived: true,
        }),
      ),
    ).resolves.toBe("updated");
    await expect(
      withDbTransaction((tx) =>
        setProjectArchivedTransaction(tx, {
          projectId,
          userId: ids.pathUser,
          archived: false,
        }),
      ),
    ).resolves.toBe("updated");
    await observer`
      update generation_runs
      set status = 'completed'
      where id = ${exportRunId}
    `;

    await observer`
      insert into generation_runs (id, project_id, user_id, kind, status, config)
      values (
        ${activeRunId}, ${projectId}, ${ids.pathUser},
        'edit_pass', 'running', '{}'::jsonb
      )
    `;
    await expect(
      withDbTransaction((tx) =>
        setProjectArchivedTransaction(tx, {
          projectId,
          userId: ids.pathUser,
          archived: true,
        }),
      ),
    ).resolves.toBe("active_run");
    [project] = (await observer`
      select status from projects where id = ${projectId}
    `) as unknown as Array<{ status: string }>;
    expect(project?.status).toBe("editing");

    await observer`
      update generation_runs
      set status = 'completed'
      where id = ${activeRunId}
    `;
    await observer`
      update generation_runs
      set config = ${JSON.stringify({
        protocolVersion: 2,
        targetChapters: 1,
        completion: {
          finalized: {
            sourceRunId: completedRunId,
            manuscriptDigest: "source-bound-proof",
          },
        },
      })}::jsonb
      where id = ${completedRunId}
    `;
    await expect(
      withDbTransaction((tx) =>
        setProjectArchivedTransaction(tx, {
          projectId,
          userId: ids.pathUser,
          archived: true,
        }),
      ),
    ).resolves.toBe("updated");
    await expect(
      withDbTransaction((tx) =>
        setProjectArchivedTransaction(tx, {
          projectId,
          userId: ids.pathUser,
          archived: false,
        }),
      ),
    ).resolves.toBe("updated");
    [project] = (await observer`
      select status from projects where id = ${projectId}
    `) as unknown as Array<{ status: string }>;
    expect(project?.status).toBe("complete");
  });

  it("allows the exact included-story cap boundary and blocks the next fraction", async () => {
    const fixture = await createMeteringFixture("cap");
    try {
      await observer`
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, run_id, external_ref
        )
        values (
          ${fixture.userId}, -6, 'usage', 'Prior included-story work',
          ${fixture.projectId}, ${fixture.runId}, ${`metering-usage:cap:${suffix}`}
        )
      `;

      const boundary = await beginMeteredCallIntent({
        ...fixture,
        intentRef: `metering-intent:generation:${fixture.runId}:boundary:attempt:one`,
        intentPrefix: `metering-intent:generation:${fixture.runId}:boundary:attempt:`,
        usagePrefix: `llm:generation:${fixture.runId}:boundary:`,
        maxCredits: 4,
        description: "Exact trial-cap boundary",
      });
      expect(boundary.status).toBe("started");

      const over = await beginMeteredCallIntent({
        ...fixture,
        intentRef: `metering-intent:generation:${fixture.runId}:over:attempt:one`,
        intentPrefix: `metering-intent:generation:${fixture.runId}:over:attempt:`,
        usagePrefix: `llm:generation:${fixture.runId}:over:`,
        maxCredits: 0.0001,
        description: "One fraction over the trial cap",
      });
      expect(over.status).toBe("trial_cap");
    } finally {
      await observer`delete from users where id = ${fixture.userId}`;
    }
  });

  it("atomically compensates incomplete interactive output and releases its project lease", async () => {
    const userId = `e2e-metering-compensation-${suffix}`;
    const projectId = randomUUID();
    const intentRef = `metering-intent:interactive:${userId}:concept:attempt:one`;
    const externalRefPrefix = `llm:interactive:${userId}:concept:attempt:one`;
    try {
      await observer`
        insert into users (id, email)
        values (${userId}, ${`${userId}@example.test`})
      `;
      await observer`
        insert into projects (
          id, user_id, title, brief, genre, experience,
          target_chapters, target_words_per_chapter, settings
        )
        values (
          ${projectId}, ${userId}, 'Compensation fixture',
          'A disposable interactive metering fixture', 'fantasy',
          'trial_short_story', 3, 1000, '{}'::jsonb
        )
      `;
      await observer`
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, external_ref
        )
        values (
          ${userId}, 10, 'grant', 'Included story fixture',
          ${projectId}, ${`metering-grant:compensation:${suffix}`}
        )
      `;

      const intent = await beginMeteredCallIntent({
        userId,
        projectId,
        intentRef,
        intentPrefix: `metering-intent:interactive:${userId}:concept:attempt:`,
        usagePrefix: `llm:interactive:${userId}:concept:`,
        maxCredits: 1,
        description: "Interactive compensated output",
      });
      expect(intent).toMatchObject({
        status: "started",
        optionalLeaseRef: `optional-operation-lease:${intentRef}`,
      });
      if (intent.status !== "started") throw new Error("Compensation fixture was not authorized");

      const record = {
        userId,
        projectId,
        runId: null,
        agentRole: "concept",
        operation: "concept.refine",
        model: "anthropic/claude-sonnet-5",
        usage: {
          inputTokens: 1_000,
          outputTokens: 500,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
        },
      };
      const debit = {
        description: "concept.refine",
        externalRefPrefix,
        intentRef,
        reservationRef: intent.reservationRef,
        compensateDelivery: {
          description: "Provider output was incomplete and not delivered",
        },
      };

      const settled = await recordLlmCallsAndDebit([record], debit);
      await expect(recordLlmCallsAndDebit([record], debit)).resolves.toEqual(settled);

      const facts = firstRow<{
        calls: number;
        usages: number;
        refunds: number;
        claimReleases: number;
        optionalLeaseReleases: number;
        balance: string;
      }>(
        await observer`
          select
            (
              select count(*)::int from llm_calls
              where user_id = ${userId} and operation = 'concept.refine'
            ) as calls,
            count(*) filter (
              where kind = 'usage'
                and external_ref like ${`${externalRefPrefix}:%`}
            )::int as usages,
            count(*) filter (
              where external_ref = ${`delivery-refund:${externalRefPrefix}`}
            )::int as refunds,
            count(*) filter (
              where external_ref = ${`release:${intent.reservationRef}`}
            )::int as "claimReleases",
            count(*) filter (
              where external_ref = ${`release:optional-operation-lease:${intentRef}`}
            )::int as "optionalLeaseReleases",
            coalesce(sum(amount), 0)::text as balance
          from credit_ledger
          where user_id = ${userId}
        `,
      );
      expect(facts).toMatchObject({
        calls: 1,
        usages: 1,
        refunds: 1,
        claimReleases: 1,
        optionalLeaseReleases: 1,
      });
      expect(Number(facts?.balance)).toBe(10);

      const grossCap = await beginMeteredCallIntent({
        userId,
        projectId,
        intentRef: `metering-intent:interactive:${userId}:after-refund:attempt:one`,
        intentPrefix: `metering-intent:interactive:${userId}:after-refund:attempt:`,
        usagePrefix: `llm:interactive:${userId}:after-refund:`,
        maxCredits: 10,
        description: "Delivery refund does not restore provider-spend capacity",
      });
      expect(grossCap.status).toBe("trial_cap");
    } finally {
      await observer`delete from users where id = ${userId}`;
    }
  });

  it("allows a durable authoring retry after malformed structured output is settled and compensated", async () => {
    const fixture = await createMeteringFixture("structured-output-retry");
    const intentPrefix = `metering-intent:generation:${fixture.runId}:entity-bible:attempt:`;
    const usagePrefix = `llm:generation:${fixture.runId}:entity-bible:`;
    const firstIntentRef = `${intentPrefix}one`;
    const firstUsageRef = `${usagePrefix}attempt:one`;
    try {
      const first = await beginMeteredCallIntent({
        ...fixture,
        intentRef: firstIntentRef,
        intentPrefix,
        usagePrefix,
        maxCredits: 1,
        description: "Structured-output provider attempt",
      });
      expect(first.status).toBe("started");
      if (first.status !== "started") throw new Error("First provider attempt was not authorized");

      await recordLlmCallsAndDebit(
        [
          {
            userId: fixture.userId,
            projectId: fixture.projectId,
            runId: fixture.runId,
            agentRole: "entity-bible",
            operation: "entity.bible",
            model: "anthropic/claude-sonnet-5",
            usage: {
              inputTokens: 1_000,
              outputTokens: 500,
              cachedInputTokens: 0,
              cacheWriteTokens: 0,
            },
          },
        ],
        {
          description: "entity.bible",
          externalRefPrefix: firstUsageRef,
          intentRef: firstIntentRef,
          reservationRef: first.reservationRef,
          compensateDelivery: {
            description: "Malformed structured output was not delivered",
          },
        },
      );

      const retry = await beginMeteredCallIntent({
        ...fixture,
        intentRef: `${intentPrefix}two`,
        intentPrefix,
        usagePrefix,
        maxCredits: 1,
        description: "Safe structured-output retry",
      });
      expect(retry.status).toBe("started");

      const facts = firstRow<{ refunds: number; settled: number }>(
        await observer`
          select
            count(*) filter (
              where external_ref = ${`delivery-refund:${firstUsageRef}`}
            )::int as refunds,
            count(*) filter (
              where external_ref = ${`intent-settled:${firstIntentRef}`}
            )::int as settled
          from credit_ledger
          where user_id = ${fixture.userId}
        `,
      );
      expect(facts).toEqual({ refunds: 1, settled: 1 });
    } finally {
      await observer`delete from users where id = ${fixture.userId}`;
    }
  });

  it("blocks compensated redo while optional delivery is pending and after its receipt commits", async () => {
    const userId = `e2e-optional-delivery-${suffix}`;
    const projectId = randomUUID();
    const bookId = randomUUID();
    const chapterId = randomUUID();
    const operationKey = randomUUID();
    const meteringKey = `project:${projectId}:chapter:${chapterId}:tool:mermaid:${operationKey}`;
    const intentPrefix = `metering-intent:interactive:${userId}:${meteringKey}:tool.mermaid:attempt:`;
    const usagePrefix = `llm:interactive:${userId}:${meteringKey}:tool.mermaid:`;
    const receiptRef = optionalDeliveryReceiptRef({
      projectId,
      resource: `content-tool:${chapterId}:mermaid`,
      operationKey,
    });
    const leasePrefix = optionalDeliveryLeasePrefix({
      userId,
      meteringIdempotencyKey: meteringKey,
    });
    try {
      await observer`
        insert into users (id, email, role)
        values (${userId}, ${`${userId}@example.test`}, 'admin')
      `;
      await observer`
        insert into projects (
          id, user_id, title, brief, genre, experience,
          target_chapters, target_words_per_chapter, settings
        ) values (
          ${projectId}, ${userId}, 'Optional delivery fixture', 'Receipt race fixture',
          'fantasy', 'full_book', 3, 1000, '{}'::jsonb
        )
      `;
      await observer`
        insert into books (id, project_id, title, front_matter)
        values (${bookId}, ${projectId}, 'Optional delivery fixture', '{}'::jsonb)
      `;
      await observer`
        insert into chapters (
          id, book_id, chapter_number, title, content, word_count, status
        ) values (
          ${chapterId}, ${bookId}, 1, 'Fixture', 'Fixture prose.', 2, 'drafted'
        )
      `;
      await observer`
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, external_ref
        ) values (
          ${userId}, 10, 'grant', 'Optional delivery fixture',
          ${projectId}, ${`optional-delivery-grant:${suffix}`}
        )
      `;

      const intentRef = `${intentPrefix}one`;
      const started = await beginMeteredCallIntent({
        userId,
        projectId,
        intentRef,
        intentPrefix,
        usagePrefix,
        deliveryReceiptRef: receiptRef,
        maxCredits: 1,
        description: "Optional delivery fixture",
      });
      expect(started.status).toBe("started");
      const settled = await recordLlmCallsAndDebit(
        [
          {
            userId,
            projectId,
            runId: null,
            agentRole: "content-tool",
            operation: "tool.mermaid",
            model: "anthropic/claude-haiku-4.5",
            usage: {
              inputTokens: 100,
              outputTokens: 50,
              cachedInputTokens: 0,
              cacheWriteTokens: 0,
            },
          },
        ],
        {
          description: "tool.mermaid",
          externalRefPrefix: `${usagePrefix}attempt:one`,
          intentRef,
          reservationRef: started.reservationRef,
        },
      );
      expect(settled.debitedCredits).toBeGreaterThan(0);

      const pending = await beginMeteredCallIntent({
        userId,
        projectId,
        intentRef: `${intentPrefix}two`,
        intentPrefix,
        usagePrefix,
        deliveryReceiptRef: receiptRef,
        maxCredits: 1,
        description: "Duplicate optional delivery",
      });
      expect(pending.status).toBe("delivery_pending");
      await expect(
        refundSettledLogicalUsageForRedo({
          userId,
          projectId,
          usagePrefix,
          deliveryReceiptRef: receiptRef,
          optionalLeasePrefix: leasePrefix,
        }),
      ).resolves.toBe(false);

      await withDbTransaction((tx) =>
        persistContentToolDeliveryTransaction(tx, {
          userId,
          projectId,
          chapterId,
          toolId: "mermaid",
          operationKey,
          deliveryReceiptRef: receiptRef,
          text: "Fixture prose.",
          options: {},
          output: { kind: "mermaid", source: "flowchart LR; A-->B" },
          usd: settled.meteredUsd.toFixed(6),
          optionalLeaseRefs: started.optionalLeaseRef ? [started.optionalLeaseRef] : [],
        }),
      );

      const delivered = await beginMeteredCallIntent({
        userId,
        projectId,
        intentRef: `${intentPrefix}three`,
        intentPrefix,
        usagePrefix,
        deliveryReceiptRef: receiptRef,
        maxCredits: 1,
        description: "Delivered optional replay",
      });
      expect(delivered.status).toBe("delivered");
      await expect(
        refundSettledLogicalUsageForRedo({
          userId,
          projectId,
          usagePrefix,
          deliveryReceiptRef: receiptRef,
          optionalLeasePrefix: leasePrefix,
        }),
      ).resolves.toBe(false);

      const facts = firstRow<{ receipts: number; refunds: number; releases: number }>(
        await observer`
          select
            count(*) filter (where external_ref = ${receiptRef})::int as receipts,
            count(*) filter (where external_ref like ${`delivery-refund:${usagePrefix}%`})::int
              as refunds,
            count(*) filter (
              where external_ref = ${`release:${started.optionalLeaseRef}`}
            )::int as releases
          from credit_ledger
          where user_id = ${userId}
        `,
      );
      expect(facts).toEqual({ receipts: 1, refunds: 0, releases: 1 });
    } finally {
      await observer`delete from users where id = ${userId}`;
    }
  });

  it("serializes a repeated intent and persists one claim under a concurrent race", async () => {
    const fixture = await createMeteringFixture("intent-race");
    const intentRef = `metering-intent:generation:${fixture.runId}:same:attempt:one`;
    try {
      const start = () =>
        beginMeteredCallIntent({
          ...fixture,
          intentRef,
          intentPrefix: `metering-intent:generation:${fixture.runId}:same:attempt:`,
          usagePrefix: `llm:generation:${fixture.runId}:same:`,
          maxCredits: 2,
          description: "Concurrent idempotent intent",
        });
      const results = await Promise.all([start(), start()]);
      expect(results.map((result) => result.status).sort()).toEqual(["pending", "started"]);

      const facts = firstRow<{ intents: number; claims: number }>(
        await observer`
          select
            count(*) filter (where external_ref = ${intentRef})::int as intents,
            count(*) filter (
              where external_ref = ${`metering-claim:${intentRef}`}
            )::int as claims
          from credit_ledger
          where user_id = ${fixture.userId}
        `,
      );
      expect(facts).toMatchObject({ intents: 1, claims: 1 });
    } finally {
      await observer`delete from users where id = ${fixture.userId}`;
    }
  });

  it("serializes sibling claims and never over-transfers a partially consumed parent hold", async () => {
    const fixture = await createMeteringFixture("parent-race");
    const parentRef = `generation-reservation:${fixture.runId}:wave-1`;
    try {
      await observer`
        insert into credit_ledger (
          user_id, amount, kind, description, project_id, run_id, external_ref
        )
        values (
          ${fixture.userId}, -4, 'adjustment', 'Parent phase reservation',
          ${fixture.projectId}, ${fixture.runId}, ${parentRef}
        )
      `;
      const startSibling = (sibling: string) => {
        const intentRef = `metering-intent:generation:${fixture.runId}:${sibling}:attempt:one`;
        return beginMeteredCallIntent({
          ...fixture,
          intentRef,
          intentPrefix: `metering-intent:generation:${fixture.runId}:${sibling}:attempt:`,
          usagePrefix: `llm:generation:${fixture.runId}:${sibling}:`,
          parentReservationRef: parentRef,
          maxCredits: 3,
          description: `Concurrent sibling ${sibling}`,
        });
      };
      const results = await Promise.all([startSibling("left"), startSibling("right")]);
      expect(results.map((result) => result.status)).toEqual(["started", "started"]);

      const facts = firstRow<{ transferred: string; claimed: string }>(
        await observer`
          select
            coalesce(sum(amount) filter (
              where external_ref like ${`reservation-claim-release:${parentRef}:%`}
            ), 0)::text as transferred,
            coalesce(-sum(amount) filter (
              where external_ref like 'metering-claim:%'
            ), 0)::text as claimed
          from credit_ledger
          where user_id = ${fixture.userId}
        `,
      );
      expect(Number(facts?.transferred)).toBe(4);
      expect(Number(facts?.claimed)).toBe(6);
    } finally {
      await observer`delete from users where id = ${fixture.userId}`;
    }
  });

  it("executes the project refresh and settings transactions against real constraints", async () => {
    const refreshed = await withDbTransaction(async (tx) => {
      const [project] = await tx
        .select()
        .from(schema.projects)
        .where(
          // This fixture is owned by the exact test identity; no broad lookup
          // can accidentally select seeded browser data on the shared branch.
          sql`${schema.projects.id} = ${ids.refreshProject}`,
        )
        .limit(1);
      if (!project) throw new Error("Refresh fixture disappeared");
      return refreshProjectBeforeFirstRunTransaction(tx, {
        project,
        userId: ids.pathUser,
        values: {
          title: "After refresh",
          brief: "The saved setup was safely refreshed before generation.",
          targetChapters: 4,
          targetWordsPerChapter: 1200,
        },
      });
    });
    expect(refreshed.title).toBe("After refresh");

    const refreshRows = await observer`
      select p.title as project_title, b.title as book_title, p.target_chapters
      from projects p
      join books b on b.project_id = p.id
      where p.id = ${ids.refreshProject}
    `;
    expect(refreshRows).toMatchObject([
      {
        project_title: "After refresh",
        book_title: "After refresh",
        target_chapters: 4,
      },
    ]);

    const outcome = await withDbTransaction((tx) =>
      updateProjectTransaction(tx, {
        projectId: ids.baseProject,
        userId: ids.pathUser,
        data: {
          title: "Renamed in one transaction",
          targetChapters: 5,
          targetWordsPerChapter: 1400,
          settings: { qualityTier: "premium" },
        },
      }),
    );
    expect(outcome).toBe("updated");

    const updatedRows = await observer`
      select p.title as project_title, b.title as book_title,
             p.target_chapters, p.target_words_per_chapter,
             p.settings->>'qualityTier' as quality_tier
      from projects p
      join books b on b.project_id = p.id
      where p.id = ${ids.baseProject}
    `;
    expect(updatedRows).toMatchObject([
      {
        project_title: "Renamed in one transaction",
        book_title: "Renamed in one transaction",
        target_chapters: 5,
        target_words_per_chapter: 1400,
        quality_tier: "premium",
      },
    ]);
  });

  it("refreshes stale wizard identity and shape after zero-work failed or cancelled starts", async () => {
    const cases = [
      {
        projectId: ids.failedRefreshProject,
        title: "Failed start corrected",
        brief: "The author corrected the failed setup before trying again.",
        chapters: 8,
        words: 1800,
      },
      {
        projectId: ids.cancelledRefreshProject,
        title: "Cancelled start corrected",
        brief: "The author revised the cancelled setup before trying again.",
        chapters: 9,
        words: 1900,
      },
    ];

    for (const fixture of cases) {
      const refreshed = await withDbTransaction(async (tx) => {
        const [project] = await tx
          .select()
          .from(schema.projects)
          .where(sql`${schema.projects.id} = ${fixture.projectId}`)
          .limit(1);
        if (!project) throw new Error("Terminal refresh fixture disappeared");
        return refreshProjectBeforeFirstRunTransaction(tx, {
          project,
          userId: ids.pathUser,
          values: {
            title: fixture.title,
            brief: fixture.brief,
            targetChapters: fixture.chapters,
            targetWordsPerChapter: fixture.words,
            settings: { qualityTier: "premium", requireOutlineApproval: true },
          },
        });
      });

      expect(refreshed).toMatchObject({
        title: fixture.title,
        brief: fixture.brief,
        targetChapters: fixture.chapters,
        targetWordsPerChapter: fixture.words,
        settings: { qualityTier: "premium", requireOutlineApproval: true },
      });
    }

    const rows = await observer`
      select p.id, p.title as project_title, p.brief, b.title as book_title,
             p.target_chapters, p.target_words_per_chapter,
             p.settings->>'qualityTier' as quality_tier
      from projects p
      join books b on b.project_id = p.id
      where p.id in (${ids.failedRefreshProject}, ${ids.cancelledRefreshProject})
    `;
    expect(rows).toHaveLength(2);
    for (const fixture of cases) {
      expect(rows).toContainEqual(
        expect.objectContaining({
          id: fixture.projectId,
          project_title: fixture.title,
          brief: fixture.brief,
          book_title: fixture.title,
          target_chapters: fixture.chapters,
          target_words_per_chapter: fixture.words,
          quality_tier: "premium",
        }),
      );
    }
  });

  it("keeps wizard inputs immutable after authoring begins or a run completes", async () => {
    const cases = [
      {
        projectId: ids.authoredRefreshProject,
        originalTitle: "Authored title",
        originalBrief: "Authored brief",
        chapters: 5,
        words: 1200,
      },
      {
        projectId: ids.completedRefreshProject,
        originalTitle: "Completed title",
        originalBrief: "Completed brief",
        chapters: 6,
        words: 1300,
      },
    ];

    for (const fixture of cases) {
      const result = await withDbTransaction(async (tx) => {
        const [project] = await tx
          .select()
          .from(schema.projects)
          .where(sql`${schema.projects.id} = ${fixture.projectId}`)
          .limit(1);
        if (!project) throw new Error("Immutable refresh fixture disappeared");
        return refreshProjectBeforeFirstRunTransaction(tx, {
          project,
          userId: ids.pathUser,
          values: {
            title: "Must not replace frozen title",
            brief: "Must not replace frozen brief",
            targetChapters: 20,
            targetWordsPerChapter: 4000,
            settings: { qualityTier: "draft" },
          },
        });
      });

      expect(result).toMatchObject({
        title: fixture.originalTitle,
        brief: fixture.originalBrief,
        targetChapters: fixture.chapters,
        targetWordsPerChapter: fixture.words,
      });
    }

    const rows = await observer`
      select p.id, p.title as project_title, p.brief, b.title as book_title,
             p.target_chapters, p.target_words_per_chapter
      from projects p
      join books b on b.project_id = p.id
      where p.id in (${ids.authoredRefreshProject}, ${ids.completedRefreshProject})
    `;
    expect(rows).toHaveLength(2);
    for (const fixture of cases) {
      expect(rows).toContainEqual(
        expect.objectContaining({
          id: fixture.projectId,
          project_title: fixture.originalTitle,
          brief: fixture.originalBrief,
          book_title: fixture.originalTitle,
          target_chapters: fixture.chapters,
          target_words_per_chapter: fixture.words,
        }),
      );
    }
  });

  it("persists every asset-producing transaction and replays durable deliveries", async () => {
    const diagramPaths = {
      svg: `fixtures/${suffix}/diagram.svg`,
      png: `fixtures/${suffix}/diagram.png`,
    };
    await withDbTransaction((tx) =>
      persistDiagramAssetsTransaction(tx, {
        projectId: ids.baseProject,
        chapterId: ids.baseChapter,
        sourceHash: `source-${suffix}`,
        alt: "Fixture diagram",
        svg: {
          url: `https://blob.test/${diagramPaths.svg}`,
          pathname: diagramPaths.svg,
          sizeBytes: 101,
        },
        png: {
          url: `https://blob.test/${diagramPaths.png}`,
          pathname: diagramPaths.png,
          sizeBytes: 202,
        },
      }),
    );

    const portraitCandidate = vi.fn();
    const portraitPath = `fixtures/${suffix}/portrait.png`;
    const displacedPortrait = await withDbTransaction((tx) =>
      replacePortraitAssetTransaction(tx, {
        projectId: ids.baseProject,
        entityId: ids.baseEntity,
        url: `https://blob.test/${portraitPath}`,
        pathname: portraitPath,
        contentType: "image/png",
        sizeBytes: 303,
        meta: { operationKey: `portrait-${suffix}` },
        onDisplacedCandidate: portraitCandidate,
      }),
    );
    expect(displacedPortrait).toEqual({
      id: ids.oldPortraitAsset,
      pathname: "fixtures/old-portrait.png",
    });
    expect(portraitCandidate).toHaveBeenCalledWith(displacedPortrait);

    const coverCandidate = vi.fn();
    const coverPath = `fixtures/${suffix}/cover.png`;
    const displacedCover = await withDbTransaction((tx) =>
      replaceCoverAssetTransaction(tx, {
        projectId: ids.baseProject,
        bookId: ids.baseBook,
        title: "Renamed in one transaction",
        operationKey: `cover-${suffix}`,
        url: `https://blob.test/${coverPath}`,
        pathname: coverPath,
        contentType: "image/png",
        sizeBytes: 404,
        onDisplacedCandidate: coverCandidate,
      }),
    );
    expect(displacedCover).toEqual({
      id: ids.oldCoverAsset,
      pathname: "fixtures/old-cover.png",
    });
    expect(coverCandidate).toHaveBeenCalledWith(displacedCover);

    const illustrationPath = `fixtures/${suffix}/illustration.png`;
    const contentInput = {
      userId: ids.pathUser,
      projectId: ids.baseProject,
      chapterId: ids.baseChapter,
      toolId: "illustration",
      operationKey: `tool-${suffix}`,
      text: "Fixture selection",
      options: { style: "ink" },
      output: {
        kind: "image",
        url: `https://blob.test/${illustrationPath}`,
        alt: "Fixture illustration",
      },
      usd: "0.012345",
      asset: {
        url: `https://blob.test/${illustrationPath}`,
        pathname: illustrationPath,
        contentType: "image/png",
        sizeBytes: 505,
        prompt: "A precise fixture prompt",
      },
    } as const;
    const delivered = await withDbTransaction((tx) =>
      persistContentToolDeliveryTransaction(tx, contentInput),
    );
    const replayed = await withDbTransaction((tx) =>
      persistContentToolDeliveryTransaction(tx, {
        ...contentInput,
        output: { ...contentInput.output, alt: "This replay must not replace durable output" },
      }),
    );
    expect(delivered.replayed).toBe(false);
    expect(replayed).toEqual({ output: contentInput.output, replayed: true });

    const exportPath = `fixtures/${suffix}/manuscript.epub`;
    const exportInput = {
      projectId: ids.baseProject,
      runId: randomUUID(),
      kind: "export_epub" as const,
      url: `https://blob.test/${exportPath}`,
      pathname: exportPath,
      contentType: "application/epub+zip",
      sizeBytes: 606,
      format: "epub",
      filename: "fixture.epub",
    };
    const storedExport = await withDbTransaction((tx) =>
      persistExportAssetTransaction(tx, exportInput),
    );
    const replayedExport = await withDbTransaction((tx) =>
      persistExportAssetTransaction(tx, {
        ...exportInput,
        pathname: `fixtures/${suffix}/must-not-insert.epub`,
      }),
    );
    expect(storedExport?.id).toBe(replayedExport?.id);

    const persisted = await observer`
      select kind, blob_pathname
      from assets
      where project_id = ${ids.baseProject}
        and blob_pathname in (
          ${diagramPaths.svg}, ${diagramPaths.png}, ${portraitPath},
          ${coverPath}, ${illustrationPath}, ${exportPath}
        )
      order by blob_pathname
    `;
    expect(persisted).toHaveLength(6);

    const entity = firstRow<{ blob_pathname: string }>(
      await observer`
        select a.blob_pathname
        from entities e
        join assets a on a.id = e.portrait_asset_id
        where e.id = ${ids.baseEntity}
      `,
    );
    expect(entity).toMatchObject({ blob_pathname: portraitPath });

    const book = firstRow<{ cover_url: string }>(
      await observer`
        select front_matter->>'coverUrl' as cover_url
        from books
        where id = ${ids.baseBook}
      `,
    );
    expect(book).toMatchObject({ cover_url: `https://blob.test/${coverPath}` });

    const toolFacts = firstRow<{ run_count: number; asset_count: number }>(
      await observer`
        select count(*)::int as run_count,
               count(*) filter (where a.blob_pathname = ${illustrationPath})::int as asset_count
        from content_tool_runs r
        left join assets a
          on a.project_id = r.project_id
         and a.kind = 'illustration'
         and a.meta->>'operationKey' = r.input->>'operationKey'
        where r.project_id = ${ids.baseProject}
          and r.input->>'operationKey' = ${contentInput.operationKey}
      `,
    );
    expect(toolFacts).toMatchObject({ run_count: 1, asset_count: 1 });
  });

  it("keeps cover and portrait delivery receipts after their assets are replaced", async () => {
    const firstCoverKey = randomUUID();
    const secondCoverKey = randomUUID();
    const firstPortraitKey = randomUUID();
    const secondPortraitKey = randomUUID();
    const firstCoverReceipt = optionalDeliveryReceiptRef({
      projectId: ids.baseProject,
      resource: "cover",
      operationKey: firstCoverKey,
    });
    const secondCoverReceipt = optionalDeliveryReceiptRef({
      projectId: ids.baseProject,
      resource: "cover",
      operationKey: secondCoverKey,
    });
    const firstPortraitReceipt = optionalDeliveryReceiptRef({
      projectId: ids.baseProject,
      resource: `portrait:${ids.baseEntity}`,
      operationKey: firstPortraitKey,
    });
    const secondPortraitReceipt = optionalDeliveryReceiptRef({
      projectId: ids.baseProject,
      resource: `portrait:${ids.baseEntity}`,
      operationKey: secondPortraitKey,
    });
    const cover = (operationKey: string, receipt: string, label: string) =>
      withDbTransaction((tx) =>
        persistCoverDeliveryTransaction(tx, {
          userId: ids.pathUser,
          projectId: ids.baseProject,
          bookId: ids.baseBook,
          title: "Path fixture",
          operationKey,
          deliveryReceiptRef: receipt,
          url: `https://blob.test/${label}.png`,
          pathname: `fixtures/${suffix}/${label}.png`,
          contentType: "image/png",
          sizeBytes: 100,
          usd: "0.067000",
        }),
      );
    const portrait = (operationKey: string, receipt: string, label: string) =>
      withDbTransaction((tx) =>
        persistPortraitDeliveryTransaction(tx, {
          userId: ids.pathUser,
          projectId: ids.baseProject,
          entityId: ids.baseEntity,
          operationKey,
          deliveryReceiptRef: receipt,
          url: `https://blob.test/${label}.png`,
          pathname: `fixtures/${suffix}/${label}.png`,
          contentType: "image/png",
          sizeBytes: 100,
          prompt: label,
          usd: "0.067000",
        }),
      );

    const firstCover = await cover(firstCoverKey, firstCoverReceipt, "receipt-cover-one");
    const firstPortrait = await portrait(
      firstPortraitKey,
      firstPortraitReceipt,
      "receipt-portrait-one",
    );
    await cover(secondCoverKey, secondCoverReceipt, "receipt-cover-two");
    await portrait(secondPortraitKey, secondPortraitReceipt, "receipt-portrait-two");

    await observer`
      delete from assets
      where project_id = ${ids.baseProject}
        and blob_pathname in (
          ${`fixtures/${suffix}/receipt-cover-one.png`},
          ${`fixtures/${suffix}/receipt-portrait-one.png`}
        )
    `;

    const replayedCover = await cover(firstCoverKey, firstCoverReceipt, "must-not-insert-cover");
    const replayedPortrait = await portrait(
      firstPortraitKey,
      firstPortraitReceipt,
      "must-not-insert-portrait",
    );
    expect(replayedCover).toMatchObject({ output: firstCover.output, replayed: true });
    expect(replayedPortrait).toMatchObject({ output: firstPortrait.output, replayed: true });

    const facts = firstRow<{
      receipts: number;
      deliveries: number;
      forbidden_assets: number;
      cover_url: string;
      portrait_url: string;
    }>(
      await observer`
        select
          (
            select count(*)::int from credit_ledger
            where external_ref in (
              ${firstCoverReceipt}, ${secondCoverReceipt},
              ${firstPortraitReceipt}, ${secondPortraitReceipt}
            )
          ) as receipts,
          (
            select count(*)::int from content_tool_runs
            where project_id = ${ids.baseProject}
              and input->>'deliveryReceiptRef' in (
                ${firstCoverReceipt}, ${secondCoverReceipt},
                ${firstPortraitReceipt}, ${secondPortraitReceipt}
              )
          ) as deliveries,
          (
            select count(*)::int from assets
            where blob_pathname in (
              ${`fixtures/${suffix}/must-not-insert-cover.png`},
              ${`fixtures/${suffix}/must-not-insert-portrait.png`}
            )
          ) as forbidden_assets,
          (select front_matter->>'coverUrl' from books where id = ${ids.baseBook}) as cover_url,
          (
            select asset.blob_url
            from entities entity
            join assets asset on asset.id = entity.portrait_asset_id
            where entity.id = ${ids.baseEntity}
          ) as portrait_url
      `,
    );
    expect(facts).toEqual({
      receipts: 4,
      deliveries: 4,
      forbidden_assets: 0,
      cover_url: "https://blob.test/receipt-cover-two.png",
      portrait_url: "https://blob.test/receipt-portrait-two.png",
    });
  });

  it("rolls back an extracted asset operation without leaking a partial row", async () => {
    const rollbackPath = `fixtures/${suffix}/rolled-back.svg`;
    await expect(
      withDbTransaction(async (tx) => {
        await persistDiagramAssetsTransaction(tx, {
          projectId: ids.baseProject,
          chapterId: ids.baseChapter,
          sourceHash: `rollback-${suffix}`,
          alt: "Rolled back fixture",
          svg: {
            url: `https://blob.test/${rollbackPath}`,
            pathname: rollbackPath,
            sizeBytes: 1,
          },
          png: {
            url: `https://blob.test/${rollbackPath}.png`,
            pathname: `${rollbackPath}.png`,
            sizeBytes: 1,
          },
        });
        throw new Error("rollback extracted asset operation");
      }),
    ).rejects.toThrow("rollback extracted asset operation");

    const facts = firstRow<{ count: number }>(
      await observer`
        select count(*)::int as count
        from assets
        where blob_pathname in (${rollbackPath}, ${`${rollbackPath}.png`})
      `,
    );
    expect(facts).toMatchObject({ count: 0 });
  });

  it("executes the cleanup lock snapshots against committed asset state", async () => {
    const exists = await withDbTransaction((tx) =>
      projectExistsUnderAuthoringLock(tx, ids.baseProject),
    );
    expect(exists).toBe(true);

    const referenced = await withDbTransaction((tx) =>
      referencedAssetPathnamesUnderAuthoringLock(tx, ids.baseProject, [
        "fixtures/old-cover.png",
        `fixtures/${suffix}/not-referenced.png`,
      ]),
    );
    expect(referenced).toEqual(["fixtures/old-cover.png"]);
  });

  it("transitions and reclaims real authoring runs with project and wallet locks", async () => {
    await observer`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config
      )
      values (
        ${ids.firstRun}, ${ids.runProject}, ${ids.pathUser}, ${randomUUID()},
        'full_book', 'queued', '{"targetChapters":3}'::jsonb
      )
    `;

    await expect(
      transitionAuthoringRunState({
        runId: ids.firstRun,
        projectId: ids.runProject,
        userId: ids.pathUser,
        status: "running",
      }),
    ).resolves.toMatchObject({ status: "running", transitioned: true });
    await expect(
      transitionAuthoringRunState({
        runId: ids.firstRun,
        projectId: ids.runProject,
        userId: ids.pathUser,
        status: "completed",
      }),
    ).resolves.toMatchObject({ status: "completed", transitioned: true });

    const terminalFacts = firstRow<{
      status: string;
      project_status: string;
      close_requested: boolean;
    }>(
      await observer`
        select r.status, p.status as project_status,
               exists (
                 select 1 from credit_ledger l
                 where l.external_ref = ${`reservation-close-request:${ids.firstRun}`}
               ) as close_requested
        from generation_runs r
        join projects p on p.id = r.project_id
        where r.id = ${ids.firstRun}
      `,
    );
    expect(terminalFacts).toMatchObject({
      status: "completed",
      project_status: "editing",
      close_requested: true,
    });

    await observer`
      insert into generation_runs (
        id, project_id, user_id, request_key, kind, status, config, acceptance_uncertain_at
      )
      values (
        ${ids.uncertainRun}, ${ids.runProject}, ${ids.pathUser}, ${randomUUID()},
        'chapter', 'queued', '{"chapterId":"fixture","dispatchReady":true}'::jsonb, now()
      )
    `;
    const claimed = await claimUncertainAuthoringRun({
      runId: ids.uncertainRun,
      projectId: ids.runProject,
      userId: ids.pathUser,
    });
    expect(claimed).toMatchObject({
      id: ids.uncertainRun,
      projectId: ids.runProject,
      userId: ids.pathUser,
      kind: "chapter",
    });
    await expect(
      claimUncertainAuthoringRun({
        runId: ids.uncertainRun,
        projectId: ids.runProject,
        userId: ids.pathUser,
      }),
    ).resolves.toBeNull();
  });

  it("deletes a project only after capturing its exact cleanup set", async () => {
    const scheduleCleanup = vi.fn(async () => undefined);
    const outcome = await withDbTransaction((tx) =>
      deleteProjectTransaction(tx, {
        projectId: ids.deleteProject,
        userId: ids.pathUser,
        scheduleCleanup,
      }),
    );
    expect(outcome).toBe("deleted");
    expect(scheduleCleanup).toHaveBeenCalledWith(ids.deleteProject, ["fixtures/delete-cover.png"]);

    const facts = firstRow<{ count: number }>(
      await observer`
        select count(*)::int as count
        from projects
        where id = ${ids.deleteProject}
      `,
    );
    expect(facts).toMatchObject({ count: 0 });
  });

  it("executes Clerk deletion as one locked cascade with durable cleanup input", async () => {
    const scheduleCleanup = vi.fn(async () => undefined);
    const outcome = await withDbTransaction((tx) =>
      deleteClerkUserTransaction(tx, {
        userId: ids.accountUser,
        scheduleCleanup,
      }),
    );
    expect(outcome).toBe("deleted");
    expect(scheduleCleanup).toHaveBeenCalledWith([
      {
        projectId: ids.accountProject,
        pathnames: ["fixtures/account-cover.png"],
      },
    ]);
    await expect(userExists(ids.accountUser)).resolves.toBe(false);
  });
});

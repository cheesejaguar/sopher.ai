import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { schema, withDbTransaction } from "./index";
import {
  persistContentToolDeliveryTransaction,
  persistDiagramAssetsTransaction,
  persistExportAssetTransaction,
  projectExistsUnderAuthoringLock,
  referencedAssetPathnamesUnderAuthoringLock,
  replaceCoverAssetTransaction,
  replacePortraitAssetTransaction,
} from "./transaction-operations";
import { claimUncertainAuthoringRun, transitionAuthoringRunState } from "@/lib/generation-runs";
import {
  deleteProjectTransaction,
  refreshProjectBeforeFirstRunTransaction,
  updateProjectTransaction,
} from "@/lib/project-transaction-operations";
import { deleteClerkUserTransaction } from "@/lib/account-deletion-transaction";

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
        (${ids.refreshBook}, ${ids.refreshProject}, 'Before refresh', '{}'::jsonb)
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
          'image/png', 30, '{}'::jsonb
        ),
        (
          ${ids.accountAsset}, ${ids.accountProject}, 'cover',
          'https://blob.test/account-cover.png', 'fixtures/account-cover.png',
          'image/png', 40, '{}'::jsonb
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
        'chapter', 'queued', '{"chapterId":"fixture"}'::jsonb, now()
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

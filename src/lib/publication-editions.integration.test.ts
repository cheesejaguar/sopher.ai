import { createHash, randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const blobMocks = vi.hoisted(() => ({ del: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@vercel/blob", () => ({ del: blobMocks.del }));

import {
  createReaderShare,
  listReaderShares,
  loadReaderEdition,
  MAX_ACTIVE_READER_SHARES_PER_PROJECT,
  revokeReaderShare,
} from "./publication-editions";
import { cleanupReplacedAsset } from "@/workflows/cleanup-replaced-asset";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  if (isolated !== "1" && !value) return null;
  if (isolated !== "1" || !value || process.env.NODE_ENV === "production") {
    throw new Error("Reader-edition integration tests require a disposable isolated database.");
  }
  const parsed = new URL(value);
  const allowedHost = process.env.E2E_DATABASE_HOST?.trim();
  if (!allowedHost || parsed.hostname !== allowedHost) {
    throw new Error("E2E_DATABASE_HOST must match the disposable reader-test database.");
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

describeIsolated("reader editions against isolated Neon", () => {
  const suffix = randomUUID();
  const userId = `e2e-reader-owner-${suffix}`;
  const otherUserId = `e2e-reader-other-${suffix}`;
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const bookId = randomUUID();
  const otherBookId = randomUUID();
  let observer: ReturnType<typeof neon>;
  const priorDatabaseUrl = process.env.DATABASE_URL;
  const priorSecret = process.env.READER_LINK_SECRET;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Disposable database URL disappeared.");
    process.env.DATABASE_URL = databaseUrl;
    process.env.READER_LINK_SECRET = `reader-integration-secret-${suffix}`;
    observer = neon(databaseUrl);
    await observer`
      insert into users (id, email)
      values
        (${userId}, ${`${userId}@example.test`}),
        (${otherUserId}, ${`${otherUserId}@example.test`})
    `;
    await observer`
      insert into projects (
        id, user_id, title, brief, genre, experience,
        target_chapters, target_words_per_chapter, settings, status, completed_at
      ) values
        (
          ${projectId}, ${userId}, 'Reader fixture', 'A complete reader integration fixture.',
          'fantasy', 'full_book', 1, 1000, '{}'::jsonb, 'complete', now()
        ),
        (
          ${otherProjectId}, ${otherUserId}, 'Other fixture', 'A cross-project fixture.',
          'mystery', 'full_book', 1, 1000, '{}'::jsonb, 'complete', now()
        )
    `;
    await observer`
      insert into books (id, project_id, title, front_matter)
      values
        (${bookId}, ${projectId}, 'Reader fixture', '{"author":"Ada Vale"}'::jsonb),
        (${otherBookId}, ${otherProjectId}, 'Other fixture', '{}'::jsonb)
    `;
    await observer`
      insert into chapters (book_id, chapter_number, title, content, word_count, status)
      values (${bookId}, 1, 'Arrival', 'The harbour bell rang twice.', 5, 'final')
    `;
  });

  beforeEach(() => {
    blobMocks.del.mockClear();
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id in (${userId}, ${otherUserId})`;
    process.env.DATABASE_URL = priorDatabaseUrl;
    if (priorSecret === undefined) delete process.env.READER_LINK_SECRET;
    else process.env.READER_LINK_SECRET = priorSecret;
  });

  it("replays one server-derived secret and persists only its digest", async () => {
    const requestKey = randomUUID();
    const [first, replay] = await Promise.all([
      createReaderShare({
        userId,
        projectId,
        requestKey,
        expires: "30d",
        allowDownload: false,
      }),
      createReaderShare({
        userId,
        projectId,
        requestKey,
        expires: "30d",
        allowDownload: false,
      }),
    ]);
    expect(first.outcome).toBe("created");
    expect(replay.outcome).toBe("created");
    if (first.outcome !== "created" || replay.outcome !== "created") return;
    expect(replay.token).toBe(first.token);
    expect(replay.share.id).toBe(first.share.id);

    const rows = (await observer`
      select token_hash from reader_shares where id = ${first.share.id}
    `) as unknown as Array<{ token_hash: string }>;
    const hash = rows[0].token_hash;
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(first.token);
    expect(await loadReaderEdition(first.token)).not.toBeNull();
    expect(await listReaderShares(otherUserId, projectId)).toBeNull();
    expect(
      await revokeReaderShare({ userId: otherUserId, projectId, shareId: first.share.id }),
    ).toBe(false);
    expect(await revokeReaderShare({ userId, projectId, shareId: first.share.id })).toBe(true);
    expect(await revokeReaderShare({ userId, projectId, shareId: first.share.id })).toBe(true);
    expect(await loadReaderEdition(first.token)).toBeNull();
  });

  it("keeps a replaced cover while an immutable edition still references it", async () => {
    const oldAssetId = randomUUID();
    const newAssetId = randomUUID();
    const oldUrl = "https://reader-test.public.blob.vercel-storage.com/covers/old.png";
    const newUrl = "https://reader-test.public.blob.vercel-storage.com/covers/new.png";
    await observer`
      insert into assets (
        id, project_id, kind, blob_url, blob_pathname, content_type, size_bytes
      ) values (
        ${oldAssetId}, ${projectId}, 'cover', ${oldUrl}, 'covers/old.png', 'image/png', 128
      )
    `;
    await observer`
      update books
      set front_matter = jsonb_set(front_matter, '{coverUrl}', to_jsonb(${oldUrl}::text), true)
      where id = ${bookId}
    `;

    const created = await createReaderShare({
      userId,
      projectId,
      requestKey: randomUUID(),
      expires: "30d",
      allowDownload: false,
    });
    expect(created.outcome).toBe("created");
    if (created.outcome !== "created") return;
    expect((await loadReaderEdition(created.token))?.snapshot.coverUrl).toBe(oldUrl);

    await observer`
      insert into assets (
        id, project_id, kind, blob_url, blob_pathname, content_type, size_bytes
      ) values (
        ${newAssetId}, ${projectId}, 'cover', ${newUrl}, 'covers/new.png', 'image/png', 128
      )
    `;
    await observer`
      update books
      set front_matter = jsonb_set(front_matter, '{coverUrl}', to_jsonb(${newUrl}::text), true)
      where id = ${bookId}
    `;

    await cleanupReplacedAsset(projectId, oldAssetId, "covers/old.png");
    const retained = (await observer`
      select id from assets where id = ${oldAssetId}
    `) as unknown as Array<{ id: string }>;
    expect(retained).toHaveLength(1);
    expect(blobMocks.del).not.toHaveBeenCalled();
    expect((await loadReaderEdition(created.token))?.snapshot.coverUrl).toBe(oldUrl);

    await observer`delete from reader_shares where id = ${created.share.id}`;
    await observer`
      delete from publication_editions
      where project_id = ${projectId}
        and snapshot->>'coverUrl' = ${oldUrl}
    `;
    await cleanupReplacedAsset(projectId, oldAssetId, "covers/old.png");
    const removed = (await observer`
      select id from assets where id = ${oldAssetId}
    `) as unknown as Array<{ id: string }>;
    expect(removed).toHaveLength(0);
    expect(blobMocks.del).toHaveBeenCalledWith("covers/old.png");
  });

  it("serializes the active-link cap across competing requests", async () => {
    const [edition] = (await observer`
      select id from publication_editions where project_id = ${projectId} limit 1
    `) as unknown as Array<{ id: string }>;
    const editionId = edition.id;
    for (let index = 0; index < MAX_ACTIVE_READER_SHARES_PER_PROJECT - 1; index += 1) {
      const digest = createHash("sha256").update(`seed-${suffix}-${index}`).digest("hex");
      await observer`
        insert into reader_shares (edition_id, project_id, user_id, token_hash, label)
        values (${editionId}, ${projectId}, ${userId}, ${digest}, ${`seed-${index}`})
      `;
    }

    const attempts = await Promise.all([
      createReaderShare({
        userId,
        projectId,
        requestKey: randomUUID(),
        expires: "30d",
        allowDownload: false,
      }),
      createReaderShare({
        userId,
        projectId,
        requestKey: randomUUID(),
        expires: "30d",
        allowDownload: false,
      }),
    ]);
    expect(attempts.map((attempt) => attempt.outcome).sort()).toEqual(["created", "limit"]);
    expect((await listReaderShares(userId, projectId))?.length).toBe(
      MAX_ACTIVE_READER_SHARES_PER_PROJECT,
    );
  });

  it("enforces book/project integrity and project deletion cascades", async () => {
    await expect(
      observer`
        insert into publication_editions (
          project_id, book_id, user_id, source_digest, snapshot,
          incomplete, chapter_count, total_words
        ) values (
          ${projectId}, ${otherBookId}, ${userId}, ${"f".repeat(64)}, '{}'::jsonb,
          false, 1, 1
        )
      `,
    ).rejects.toThrow();

    await observer`delete from projects where id = ${projectId}`;
    const [counts] = (await observer`
      select
        (select count(*)::int from publication_editions where project_id = ${projectId}) as editions,
        (select count(*)::int from reader_shares where project_id = ${projectId}) as shares
    `) as unknown as Array<{ editions: number; shares: number }>;
    expect(counts).toMatchObject({ editions: 0, shares: 0 });
  });
});

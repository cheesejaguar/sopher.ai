import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getArchivedChapterRecoveries } from "@/db/queries/books";
import { countWords } from "@/lib/editor/anchors";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  const requested = isolated === "1" || Boolean(value);
  if (!requested) return null;

  if (isolated !== "1") {
    throw new Error("Refusing book query integration tests without E2E_DATABASE_ISOLATED=1.");
  }
  if (!value) {
    throw new Error("E2E_DATABASE_URL must identify the disposable database branch.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing book query integration tests in NODE_ENV=production.");
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

describeIsolated("archived chapter recoveries against isolated Neon", () => {
  const suffix = randomUUID();
  const userId = `e2e-archived-recoveries-${suffix}`;
  const projectId = randomUUID();
  const bookId = randomUUID();
  const draftedChapterId = randomUUID();
  const retiredChapterId = randomUUID();
  const olderResetId = randomUUID();
  const newerResetId = randomUUID();
  const newerResetAt = new Date("2026-07-22T10:00:00.000Z");
  // Mixed whitespace runs, so both the excerpt normalization and the word
  // count are exercised on more than single spaces.
  const newerResetContent = Array.from({ length: 90 }, (_, index) => `word${index}`).join(" \n\t ");
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let observer: ReturnType<typeof neon> | null = null;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Isolated database URL disappeared before test setup.");
    process.env.DATABASE_URL = databaseUrl;
    observer = neon(databaseUrl);

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
        ${projectId}, ${userId}, 'Archived recovery fixture',
        'A disposable fixture for the recovery shelf.', 'fantasy',
        'full_book', 2, 1000, '{}'::jsonb
      )
    `;
    await observer`
      insert into books (id, project_id, title)
      values (${bookId}, ${projectId}, 'Archived recovery fixture')
    `;
    await observer`
      insert into chapters (id, book_id, chapter_number, content, word_count, status)
      values
        (${draftedChapterId}, ${bookId}, 1, 'A live chapter stays off the shelf.', 7, 'drafted'),
        (${retiredChapterId}, ${bookId}, 2, '', 0, 'planned')
    `;
    await observer`
      insert into chapter_revisions (id, chapter_id, content, source, created_at)
      values
        (
          ${randomUUID()}, ${draftedChapterId}, 'Reset prose of a live chapter.',
          'generation-reset', ${new Date("2026-07-23T10:00:00.000Z")}
        ),
        (
          ${olderResetId}, ${retiredChapterId}, 'An older reset snapshot.',
          'generation-reset', ${new Date("2026-07-20T10:00:00.000Z")}
        ),
        (
          ${newerResetId}, ${retiredChapterId}, ${newerResetContent},
          'generation-reset:run', ${newerResetAt}
        ),
        (
          ${randomUUID()}, ${retiredChapterId}, 'A newer manual save is not a reset.',
          'user', ${new Date("2026-07-24T10:00:00.000Z")}
        )
    `;
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id = ${userId}`;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("returns the newest reset snapshot per retired chapter, reduced in SQL", async () => {
    const recoveries = await getArchivedChapterRecoveries(bookId);

    expect(recoveries).toHaveLength(1);
    const [recovery] = recoveries;
    expect(recovery).toMatchObject({
      chapterId: retiredChapterId,
      chapterNumber: 2,
      revisionId: newerResetId,
      wordCount: countWords(newerResetContent),
    });
    expect(recovery.archivedAt).toBeInstanceOf(Date);
    expect(recovery.archivedAt.toISOString()).toBe(newerResetAt.toISOString());
    expect(recovery.excerpt).not.toMatch(/\s{2,}|[\n\t]/);
    expect(recovery.excerpt.startsWith("word0 word1 word2")).toBe(true);
    expect(recovery.excerpt.endsWith("…")).toBe(true);
    expect(recovery.excerpt.length).toBeLessThanOrEqual(281);
  });
});

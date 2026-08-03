import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: authMocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { schema, withDbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";
import { updateBookPackage } from "./books";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  if (isolated !== "1" && !value) return null;
  if (isolated !== "1" || !value || process.env.NODE_ENV === "production") {
    throw new Error("Book-package integration tests require a disposable isolated database.");
  }
  const parsed = new URL(value);
  const allowedHost = process.env.E2E_DATABASE_HOST?.trim();
  if (!allowedHost || parsed.hostname !== allowedHost) {
    throw new Error("E2E_DATABASE_HOST must match the disposable book-package test database.");
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

describeIsolated("book package concurrency against isolated Neon", () => {
  const suffix = randomUUID();
  const userId = `e2e-book-package-${suffix}`;
  const projectId = randomUUID();
  const bookId = randomUUID();
  const coverUrl = `https://example.invalid/covers/${suffix}.png`;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let observer: ReturnType<typeof neon>;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Disposable database URL disappeared.");
    process.env.DATABASE_URL = databaseUrl;
    observer = neon(databaseUrl);
    authMocks.requireUser.mockResolvedValue({ userId });
    await observer`
      insert into users (id, email)
      values (${userId}, ${`${userId}@example.test`})
    `;
    await observer`
      insert into projects (
        id, user_id, title, brief, experience,
        target_chapters, target_words_per_chapter, settings
      ) values (
        ${projectId}, ${userId}, 'Original package',
        'A disposable book-package concurrency fixture.', 'full_book',
        3, 1000, '{}'::jsonb
      )
    `;
    await observer`
      insert into books (id, project_id, title, synopsis, front_matter)
      values (
        ${bookId}, ${projectId}, 'Original package', 'Original synopsis',
        '{"futureLayout":"preserve-me"}'::jsonb
      )
    `;
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id = ${userId}`;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("preserves a cover committed while a package save is waiting for the project lock", async () => {
    let releaseCover!: () => void;
    let coverWritten!: () => void;
    const holdCover = new Promise<void>((resolve) => {
      releaseCover = resolve;
    });
    const acquiredCover = new Promise<void>((resolve) => {
      coverWritten = resolve;
    });

    const coverMutation = withDbTransaction(async (tx) => {
      await lockProjectAuthoring(tx, projectId);
      await tx
        .update(schema.books)
        .set({
          frontMatter: { futureLayout: "preserve-me", coverUrl },
          updatedAt: new Date(),
        })
        .where(sql`${schema.books.id} = ${bookId}`);
      coverWritten();
      await holdCover;
    });
    await acquiredCover;

    const packageSave = updateBookPackage(projectId, {
      title: "The Serialized Package",
      synopsis: "A package saved alongside a generated cover.",
      author: "Ada Vale",
      dedication: "For careful transactions",
      copyrightYear: 2026,
    });
    // Without the advisory lock the action reads the pre-cover JSON here,
    // blocks only on UPDATE, and overwrites coverUrl after this transaction commits.
    await new Promise((resolve) => setTimeout(resolve, 150));
    releaseCover();

    await expect(Promise.all([coverMutation, packageSave])).resolves.toHaveLength(2);
    const [saved] = (await observer`
      select p.title as project_title, b.title as book_title, b.front_matter
      from books b
      join projects p on p.id = b.project_id
      where b.id = ${bookId}
    `) as unknown as Array<{
      project_title: string;
      book_title: string;
      front_matter: Record<string, unknown>;
    }>;

    expect(saved).toEqual({
      project_title: "The Serialized Package",
      book_title: "The Serialized Package",
      front_matter: {
        futureLayout: "preserve-me",
        coverUrl,
        author: "Ada Vale",
        dedication: "For careful transactions",
        copyrightYear: 2026,
      },
    });
  });
});

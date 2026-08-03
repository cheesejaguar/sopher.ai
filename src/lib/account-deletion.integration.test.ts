import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { schema, withDbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";
import { deleteClerkUserTransaction } from "@/lib/account-deletion-transaction";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  const requested = isolated === "1" || Boolean(value);
  if (!requested) return null;
  if (isolated !== "1" || !value) {
    throw new Error("Account deletion tests require E2E_DATABASE_ISOLATED=1 and E2E_DATABASE_URL.");
  }
  const parsed = new URL(value);
  if (
    process.env.NODE_ENV === "production" ||
    !process.env.E2E_DATABASE_HOST ||
    parsed.hostname !== process.env.E2E_DATABASE_HOST
  ) {
    throw new Error("Account deletion tests require the explicitly allowed disposable Neon host.");
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

describeIsolated("account deletion lock order against isolated Neon", () => {
  const userId = `e2e-account-delete-${randomUUID()}`;
  const projectId = randomUUID();
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let observer: ReturnType<typeof neon> | null = null;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Disposable database URL disappeared.");
    process.env.DATABASE_URL = databaseUrl;
    observer = neon(databaseUrl);
    await observer`
      insert into users (id, email)
      values (${userId}, ${`${userId}@example.test`})
    `;
    await observer`
      insert into projects (
        id, user_id, title, brief, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, 'Deletion lock fixture',
        'A disposable deletion fixture.', 'full_book',
        3, 1000, '{}'::jsonb
      )
    `;
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id = ${userId}`;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("waits behind project-scoped metering without a user-row deadlock", async () => {
    let releaseProject!: () => void;
    let projectLocked!: () => void;
    const holdProject = new Promise<void>((resolve) => {
      releaseProject = resolve;
    });
    const acquiredProject = new Promise<void>((resolve) => {
      projectLocked = resolve;
    });

    const optionalSettlement = withDbTransaction(async (tx) => {
      await lockProjectAuthoring(tx, projectId);
      projectLocked();
      await holdProject;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
      await tx.insert(schema.creditLedger).values({
        userId,
        projectId,
        amount: "0",
        kind: "adjustment",
        description: "Lock-order fixture",
        externalRef: `lock-order:${randomUUID()}`,
      });
    });
    await acquiredProject;

    const deletion = withDbTransaction((tx) =>
      deleteClerkUserTransaction(tx, {
        userId,
        scheduleCleanup: async () => {},
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    releaseProject();

    await expect(optionalSettlement).resolves.toBeUndefined();
    await expect(deletion).resolves.toBe("deleted");
  });
});

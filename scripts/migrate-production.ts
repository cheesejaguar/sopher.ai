import { Pool } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for production migrations.");

  // Drizzle Kit selects Neon automatically but emits an informational driver
  // warning on every Vercel build. Use the same one-connection WebSocket path as
  // runtime interactive transactions so migration transport is explicit, bound,
  // and always closed before Next.js starts compiling.
  const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 30_000,
    max: 1,
  });
  let migrationError: unknown;

  try {
    const client = await pool.connect();
    try {
      const db = drizzle(client);
      await db.transaction(async (tx) => {
        // Multiple Vercel builds can target the same branch concurrently.
        // Drizzle's stock migrator reads its journal before opening the apply
        // transaction, so two builds can both decide the same migration is
        // pending. Take a transaction-scoped advisory lock first, then perform
        // the journal read and apply in this same pinned transaction. This is
        // safe through Neon's pooled endpoints and releases on commit, rollback,
        // or connection loss. Bound lock and migration waits so a build cannot
        // hang indefinitely behind a broken peer.
        await tx.execute(sql.raw("set local lock_timeout = '5min'"));
        await tx.execute(sql.raw("set local statement_timeout = '10min'"));
        await tx.execute(sql`select pg_advisory_xact_lock(${0x534f5048}, ${0x45524d47})`);

        await tx.execute(sql.raw("create schema if not exists drizzle"));
        await tx.execute(
          sql.raw(`
          create table if not exists drizzle.__drizzle_migrations (
            id serial primary key,
            hash text not null,
            created_at bigint
          )
        `),
        );

        const latest = await tx.execute<{ created_at: string | number | null }>(
          sql.raw(`
          select created_at
          from drizzle.__drizzle_migrations
          order by created_at desc
          limit 1
        `),
        );
        const latestRow = latest.rows[0];
        if (latestRow?.created_at === null) {
          throw new Error("The migration journal contains a null latest marker.");
        }
        const latestCreatedAt = latestRow ? Number(latestRow.created_at) : 0;
        if (!Number.isSafeInteger(latestCreatedAt) || latestCreatedAt < 0) {
          throw new Error("The migration journal contains an invalid latest marker.");
        }

        for (const migration of migrations) {
          if (latestCreatedAt >= migration.folderMillis) continue;
          for (const statement of migration.sql) await tx.execute(sql.raw(statement));
          await tx.execute(sql`
            insert into drizzle.__drizzle_migrations (hash, created_at)
            values (${migration.hash}, ${migration.folderMillis})
          `);
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    migrationError = error;
    throw error;
  } finally {
    try {
      await pool.end();
    } catch (cleanupError) {
      if (migrationError === undefined) throw cleanupError;
      const cleanupMessage =
        cleanupError instanceof Error ? cleanupError.message : "Unknown pool cleanup failure.";
      console.error(`Database pool cleanup also failed: ${cleanupMessage}`);
    }
  }

  console.log("Database migrations applied successfully.");
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown migration failure.";
  console.error(`Database migration failed: ${message}`);
  process.exitCode = 1;
});

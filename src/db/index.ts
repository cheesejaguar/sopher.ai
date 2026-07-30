import { neon, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWebSocket } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

let _sql: ReturnType<typeof neon> | null = null;

export function getSqlClient() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql;
}

function createDb() {
  return drizzleHttp(getSqlClient(), { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

export type Db = Omit<ReturnType<typeof createDb>, "transaction">;

export function getDb(): Db {
  if (!_db) _db = createDb();
  return _db;
}

function createTransactionalDb(pool: Pool) {
  return drizzleWebSocket(pool, { schema });
}

export type DbTransaction = Parameters<
  Parameters<ReturnType<typeof createTransactionalDb>["transaction"]>[0]
>[0];

/**
 * Runs callback-style Drizzle transactions over one request-scoped WebSocket
 * connection. Neon HTTP remains the default for one-shot queries and batched
 * transactions, but it cannot support interactive transactions or savepoints.
 */
export async function withDbTransaction<T>(
  callback: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 1,
  });
  try {
    return await createTransactionalDb(pool).transaction(callback);
  } finally {
    await pool.end();
  }
}

export * as schema from "./schema";

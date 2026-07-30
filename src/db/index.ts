import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _sql: ReturnType<typeof neon> | null = null;

export function getSqlClient() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql;
}

function createDb() {
  return drizzle(getSqlClient(), { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export type Db = ReturnType<typeof getDb>;
export * as schema from "./schema";

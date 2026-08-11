import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "drizzle", "0021_funny_ted_forrester.sql"),
  "utf8",
);

describe("suggestion no-op migration", () => {
  it("retires legacy Unicode and line-ending no-ops before installing the invariant", () => {
    const backfill = migration.indexOf('UPDATE "suggestions"');
    const constraint = migration.indexOf('ADD CONSTRAINT "ck_suggestions_pending_changes_text"');

    expect(backfill).toBeGreaterThanOrEqual(0);
    expect(constraint).toBeGreaterThan(backfill);
    expect(migration.match(/chr\(13\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("chr(13) || chr(10)");
    expect(migration.match(/normalize\(/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration.match(/NFC/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

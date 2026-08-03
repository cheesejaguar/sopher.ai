import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "drizzle", "0018_unresolved_metering_incidents.sql"),
  "utf8",
);

describe("unresolved metering incident migration", () => {
  it("widens the existing check without rewriting migration history", () => {
    expect(migration).toContain('DROP CONSTRAINT "authoring_incidents_category_check"');
    expect(migration).toContain("'unresolved_metering'");
    expect(migration).toContain('ADD CONSTRAINT "authoring_incidents_category_check"');
  });
});

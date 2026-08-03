import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "drizzle", "0016_creative_decisions.sql"),
  "utf8",
);

describe("creative decisions migration", () => {
  it("adds the new stage and durable input kind without rewriting prior migrations", () => {
    expect(migration).toContain('CREATE TABLE "authoring_questions"');
    expect(migration).toContain("'creative_decision'");
    expect(migration).toContain("'awaiting_guidance'");
    expect(migration).toContain("authoring_questions_options_count_check");
    expect(migration).toContain("uq_authoring_question_run_key");
    expect(migration).toContain("authoring_questions_run_project_generation_runs_fk");
  });
});

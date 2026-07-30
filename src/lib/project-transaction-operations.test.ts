import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { wizardInputsRemainMutableSql } from "./project-transaction-operations";

describe("wizardInputsRemainMutableSql", () => {
  it("allows only terminal zero-work starts and freezes every authoring evidence path", () => {
    const query = new PgDialect().sqlToQuery(
      wizardInputsRemainMutableSql("11111111-1111-4111-8111-111111111111"),
    ).sql;

    expect(query).toContain(`"generation_runs"."status" not in ('failed', 'cancelled')`);
    expect(query).toContain(`"generation_events"."type" in ('agent', 'chapter', 'review')`);
    expect(query).toContain(`"generation_events"."payload"->>'stage' <> 'queued'`);
    expect(query).toContain('from "llm_calls"');
    expect(query).toContain(`"credit_ledger"."kind" = 'usage'`);
    expect(query).toContain("generation-reservation:");
    expect(query).toContain("interactive-reservation:");
  });
});

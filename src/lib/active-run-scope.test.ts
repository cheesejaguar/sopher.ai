import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("active-run conflict scope", () => {
  it("does not make a read-only export block optional AI authorization", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/project-spend-access.ts"), "utf8");
    const start = source.indexOf('if ((input.operationKind ?? "optional") === "optional")');
    const end = source.indexOf("return deriveProjectSpendAccess", start);
    const optionalConflict = source.slice(start, end);

    expect(optionalConflict).toContain('ne(schema.generationRuns.kind, "export")');
  });

  it("does not let an export reattach or block either wizard start conflict read", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/actions/projects.ts"), "utf8");
    const start = source.indexOf("async function startGenerationRun(");
    const end = source.indexOf("async function recoverStartBookFailure(", start);
    const wizardStart = source.slice(start, end);

    expect(wizardStart.split('ne(schema.generationRuns.kind, "export")')).toHaveLength(3);
  });
});

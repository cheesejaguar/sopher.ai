import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("workflow sandbox boundaries", () => {
  it("keeps continuity phase selection out of the Node-backed agent module", () => {
    const source = readFileSync(resolve(process.cwd(), "src/workflows/generate-book.ts"), "utf8");
    const runtimeContinuityAgentImport = source
      .split("\n")
      .find(
        (line) =>
          line.includes('from "@/ai/agents/continuity"') &&
          !line.trimStart().startsWith("import type"),
      );

    expect(runtimeContinuityAgentImport).toBeUndefined();
    expect(source).toContain('import { continuityPhaseKeys } from "@/ai/prompts/review-rubric";');
  });
});

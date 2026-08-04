import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Real-Neon integration suite (CI job `e2e-db`).
 *
 * The include list used to be thirteen hardcoded paths, which meant a new
 * `*.integration.test.ts` was never run — it was skipped silently, with a green
 * CI, until someone noticed. Globbing instead makes new files run by default;
 * the guard in tests/test-config-coverage.test.ts fails if a file ends up
 * claimed by neither integration runner.
 *
 * `src/workflows/` is excluded because those specs drive the Workflow DevKit
 * runtime (`workflow/api`) and need the `@workflow/vitest` plugin supplied by
 * vitest.integration.config.ts — they are not database tests.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "src/workflows/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});

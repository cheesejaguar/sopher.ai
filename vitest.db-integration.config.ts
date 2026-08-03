import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/db/index.integration.test.ts",
      "src/lib/run-health.integration.test.ts",
      "src/lib/authoring-reliability.integration.test.ts",
      "src/lib/authoring-fault-matrix.integration.test.ts",
      "src/lib/authoring-tool-mutation.integration.test.ts",
      "src/lib/authoring-stream-leases.integration.test.ts",
      "src/lib/chapter-review-delivery.integration.test.ts",
      "src/lib/publication-editions.integration.test.ts",
      "src/lib/export-dispatch.integration.test.ts",
      "src/lib/account-deletion.integration.test.ts",
      "src/lib/clerk-deletion-finalizer.integration.test.ts",
      "src/lib/actions/books.integration.test.ts",
    ],
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

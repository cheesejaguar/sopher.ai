import { defineConfig } from "vitest/config";
import { workflow } from "@workflow/vitest";
import path from "node:path";

export default defineConfig({
  plugins: [workflow()],
  test: {
    include: ["**/*.integration.test.ts"],
    testTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

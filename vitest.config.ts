import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * The unit suite is split into two projects by environment.
 *
 * A single global `environment: "jsdom"` cost more than the tests it served:
 * vitest self-reported 82.9s constructing environments against 14.6s actually
 * running tests, because every worker built a full DOM even though only the
 * React and browser-facing files ever touch one.
 *
 * The split rule is structural rather than a hand-maintained file list, so it
 * cannot silently rot: everything under `src/components/`, `src/hooks/` or
 * `src/lib/client/` is browser code and gets jsdom, as does every `.tsx` file
 * anywhere. `// @vitest-environment jsdom` stays available as a per-file
 * override — three `.ts` files already use it.
 *
 * "It fails loudly if you get it wrong" holds for `document` and `window`, but
 * NOT for every browser global. Node now ships its own `sessionStorage`, so
 * `src/lib/client/idempotent-paid-fetch.test.ts` passed on a developer's Node 26
 * and failed on CI's Node 24 — green locally, red in CI, which is the worst
 * possible way to learn a file was in the wrong project. Hence the directory
 * rule: `src/lib/client/` is client-side by definition, so it does not depend on
 * spotting which globals a given Node version happens to polyfill.
 */
const UI_TEST_FILES = [
  "src/components/**/*.test.ts",
  "src/hooks/**/*.test.ts",
  "src/lib/client/**/*.test.ts",
];

const SHARED_EXCLUDE = ["**/*.integration.test.ts", "**/node_modules/**"];

const alias = {
  "@": path.resolve(__dirname, "./src"),
  // `server-only` is a build-time guard with no runtime module resolvable
  // outside Next's bundler. Stubbing it lets server-only libraries be unit
  // tested without weakening the guard in the app build.
  "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          exclude: [...SHARED_EXCLUDE, ...UI_TEST_FILES],
        },
      },
      {
        // Only this project renders components, so only this project pays for
        // the React transform. tsconfig's `jsx: "react-jsx"` already lets the
        // node project import a `.tsx` module through plain esbuild.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx", "tests/**/*.test.tsx", ...UI_TEST_FILES],
          exclude: SHARED_EXCLUDE,
        },
      },
    ],
  },
});

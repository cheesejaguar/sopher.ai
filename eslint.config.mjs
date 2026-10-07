import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Type-aware promise checks. Most async work here is fire-and-forget by
    // design (polls, debounced quotes, effects), so an unhandled rejection
    // would vanish silently; these rules make every such site say `void` or
    // handle the result.
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        // JSX handlers returning a promise are routine with async actions.
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    // Playwright fixtures take a `use` callback that is not a React hook.
    files: ["e2e/**", "playwright.config.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "playwright-report/**",
    "test-results/**",
    ".lighthouseci/**",
    "next-env.d.ts",
    "src/app/.well-known/**",
    ".workflow-data/**",
    ".workflow-vitest/**",
    // Claude Code agent worktrees are whole checkouts of this repo.
    ".claude/worktrees/**",
    // iCloud/Dropbox conflict copies; ESLint does not read .gitignore.
    "**/* [0-9].*",
  ]),
]);

export default eslintConfig;

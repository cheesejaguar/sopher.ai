/**
 * Playwright E2E configuration for sopher.ai.
 *
 * Two run modes, both designed to pass:
 *
 * 1. DB-free (what CI runs) — `pnpm test:e2e` with E2E_DB unset.
 *    Runs only the "light" and "dark" projects: marketing pages, the guest
 *    sign-in card, and the /studio/new wizard through the estimate step.
 *    None of these touch Postgres — POST /api/estimates is pure computation,
 *    and the wizard's /api/usage budget readout fails soft when the DB is
 *    unreachable. This split exists because src/db/index.ts uses
 *    @neondatabase/serverless's neon-http driver, which speaks Neon's HTTP
 *    proxy protocol and cannot connect to a plain postgres:16 service
 *    container, so the CI job runs with no database at all.
 *
 * 2. Full (local) — `E2E_DB=1 pnpm test:e2e` with a real Neon DATABASE_URL in
 *    .env.local. Adds the "dbDependent-light" / "dbDependent-dark" projects
 *    (e2e/studio.spec.ts): the /studio dashboard and /studio/usage pages,
 *    which server-render from the database.
 *
 * Auth: the webServer command blanks NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and
 * CLERK_SECRET_KEY, which forces guest mode (shared dev-user, no sign-in)
 * even when .env.local carries real Clerk keys — variables already set in the
 * process environment take precedence over .env files in Next.js.
 *
 * Theming is class-based via next-themes (localStorage key "theme", "dark"
 * class on <html>). The light and dark projects run the same specs; the theme
 * is seeded before load by the fixture in e2e/helpers.ts. Full-page
 * screenshots land in e2e/screenshots/{project}/ (gitignored).
 */
import { defineConfig, devices } from "@playwright/test";
import type { ThemeOptions } from "./e2e/helpers";

const runDbTests = process.env.E2E_DB === "1";

/** Specs that require a reachable (Neon) database. */
const DB_SPEC = /studio\.spec\.ts$/;

export default defineConfig<ThemeOptions>({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Kills marketing/typewriter animations so waits and screenshots are stable.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    {
      name: "light",
      testIgnore: DB_SPEC,
      use: { ...devices["Desktop Chrome"], appTheme: "light" },
    },
    {
      name: "dark",
      testIgnore: DB_SPEC,
      use: { ...devices["Desktop Chrome"], appTheme: "dark" },
    },
    // DB-backed pages: only present when E2E_DB=1 (never set in CI).
    ...(runDbTests
      ? [
          {
            name: "dbDependent-light",
            testMatch: DB_SPEC,
            use: { ...devices["Desktop Chrome"], appTheme: "light" as const },
          },
          {
            name: "dbDependent-dark",
            testMatch: DB_SPEC,
            use: { ...devices["Desktop Chrome"], appTheme: "dark" as const },
          },
        ]
      : []),
  ],
  webServer: {
    // Explicit empty Clerk vars force guest mode; explicit PORT avoids the
    // "3000 busy, fall back to 3001" dance in `next dev`.
    command: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= CLERK_SECRET_KEY= PORT=4321 pnpm dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

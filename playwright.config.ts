/**
 * Playwright E2E configuration for sopher.ai.
 *
 * Two run modes, both designed to pass:
 *
 * 1. Public-only — `pnpm test:e2e` with E2E_DB unset.
 *    Runs desktop light/dark, responsive light/dark, and focused Firefox /
 *    WebKit smoke projects for marketing, auth, and SEO. Private Studio and
 *    wizard specs are excluded so this mode cannot inherit and touch a local
 *    DATABASE_URL through Next's .env loading.
 *
 * 2. Full acceptance — CI, or an explicit local opt-in with E2E_DB=1,
 *    E2E_DATABASE_ISOLATED=1, and E2E_DATABASE_URL. Adds the Studio, wizard,
 *    Admin, responsive product, and mobile mutation projects against a seeded,
 *    disposable Neon branch.
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
const runEditorMutationTests = runDbTests && process.env.E2E_EDITOR_MUTATIONS === "1";
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;

if (runDbTests && (!e2eDatabaseUrl || process.env.E2E_DATABASE_ISOLATED !== "1")) {
  throw new Error(
    "DB-backed E2E requires E2E_DATABASE_URL and E2E_DATABASE_ISOLATED=1. Never point it at an inherited .env.local database.",
  );
}

/** Specs that require a reachable (Neon) database. */
const DB_DESKTOP_SPEC = /[/\\](studio|wizard)\.spec\.ts$/;
const DB_RESPONSIVE_SPEC = /[/\\]studio-responsive\.spec\.ts$/;
const DB_SPEC = /(studio|studio-responsive)\.spec\.ts$/;
const WIZARD_SPEC = /[/\\]wizard\.spec\.ts$/;
const RESPONSIVE_SPEC = /[/\\]responsive\.spec\.ts$/;
const BROWSER_SMOKE_SPEC = /browser-smoke\.spec\.ts$/;
const EDITOR_MUTATION_SPEC = /editor-mobile\.spec\.ts$/;
const DB_FREE_EXCLUSIONS = [
  DB_SPEC,
  WIZARD_SPEC,
  RESPONSIVE_SPEC,
  BROWSER_SMOKE_SPEC,
  EDITOR_MUTATION_SPEC,
];

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
    baseURL: "http://127.0.0.1:4321",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Kills marketing/typewriter animations so waits and screenshots are stable.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    {
      name: "light",
      testIgnore: DB_FREE_EXCLUSIONS,
      use: { ...devices["Desktop Chrome"], appTheme: "light" },
    },
    {
      name: "dark",
      testIgnore: DB_FREE_EXCLUSIONS,
      use: { ...devices["Desktop Chrome"], appTheme: "dark" },
    },
    {
      name: "mobile-light",
      testMatch: RESPONSIVE_SPEC,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        appTheme: "light",
      },
    },
    {
      name: "mobile-dark",
      testMatch: RESPONSIVE_SPEC,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        appTheme: "dark",
      },
    },
    {
      name: "firefox-smoke",
      testMatch: BROWSER_SMOKE_SPEC,
      use: { ...devices["Desktop Firefox"], appTheme: "dark" },
    },
    {
      name: "webkit-smoke",
      testMatch: BROWSER_SMOKE_SPEC,
      use: { ...devices["Desktop Safari"], appTheme: "light" },
    },
    // DB-backed pages: only present when the explicit isolation guard passes.
    ...(runDbTests
      ? [
          {
            name: "dbDependent-light",
            testMatch: DB_DESKTOP_SPEC,
            use: { ...devices["Desktop Chrome"], appTheme: "light" as const },
          },
          {
            name: "dbDependent-dark",
            testMatch: DB_DESKTOP_SPEC,
            use: { ...devices["Desktop Chrome"], appTheme: "dark" as const },
          },
          {
            name: "dbMobile-light",
            testMatch: DB_RESPONSIVE_SPEC,
            use: {
              ...devices["Desktop Chrome"],
              viewport: { width: 390, height: 844 },
              appTheme: "light" as const,
            },
          },
          {
            name: "dbMobile-dark",
            testMatch: DB_RESPONSIVE_SPEC,
            use: {
              ...devices["Desktop Chrome"],
              viewport: { width: 390, height: 844 },
              appTheme: "dark" as const,
            },
          },
        ]
      : []),
    ...(runEditorMutationTests
      ? [
          {
            name: "dbEditor-mobile",
            testMatch: EDITOR_MUTATION_SPEC,
            // Preserve deterministic screenshots and pending-suggestion
            // fixtures: destructive editor checks run after every read-only
            // surface has completed.
            dependencies: [
              "light",
              "dark",
              "mobile-light",
              "mobile-dark",
              "firefox-smoke",
              "webkit-smoke",
              "dbDependent-light",
              "dbDependent-dark",
              "dbMobile-light",
              "dbMobile-dark",
            ],
            use: {
              ...devices["Desktop Chrome"],
              viewport: { width: 390, height: 844 },
              appTheme: "dark" as const,
            },
          },
        ]
      : []),
  ],
  webServer: {
    // Explicit empty Clerk vars force guest mode; explicit PORT avoids the
    // "3000 busy, fall back to 3001" dance in `next dev`.
    command: "pnpm dev --hostname 127.0.0.1",
    env: {
      ...process.env,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: "",
      PORT: "4321",
      ...(e2eDatabaseUrl ? { DATABASE_URL: e2eDatabaseUrl } : {}),
    },
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

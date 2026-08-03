/**
 * Shared E2E helpers: theme fixture, axe accessibility scan, screenshots.
 *
 * Specs should import { test, expect } from "./helpers" (not "@playwright/test")
 * so the per-project `appTheme` option is applied before every page load.
 */
import path from "node:path";
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

export type AppTheme = "light" | "dark";

/** Custom per-project options — set via `use: { appTheme: ... }` in playwright.config.ts. */
export interface ThemeOptions {
  appTheme: AppTheme;
}

/**
 * Forces the app theme before any document in the page loads.
 *
 * The app uses next-themes with the class strategy: the chosen theme is
 * persisted under the localStorage key "theme" and applied as a class
 * ("light" / "dark") on <html> by a blocking inline script in <head>.
 * Seeding localStorage is what actually selects the theme; toggling the class
 * here as well is best-effort so even the very first paint is correct.
 */
export async function setTheme(page: Page, theme: AppTheme): Promise<void> {
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem("theme", t);
    } catch {
      // Storage unavailable — next-themes will fall back to its default.
    }
    try {
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(t);
    } catch {
      // documentElement may not exist yet when init scripts run; the
      // next-themes head script applies the class before first paint anyway.
    }
  }, theme);
}

/** Test with the project's `appTheme` applied automatically to every page. */
export const test = base.extend<ThemeOptions>({
  appTheme: ["dark", { option: true }],
  page: async ({ page, appTheme }, use) => {
    await setTheme(page, appTheme);
    await use(page);
  },
});

export { expect };

/**
 * Ends a fixture-dependent test when its isolated seed is incomplete.
 *
 * Ad-hoc local DB runs may point at a fresh branch, so missing data remains a
 * skip by default. Acceptance runs set E2E_FIXTURES_REQUIRED=1: in that mode a
 * missing fixture is a broken seed/contract and must fail loudly.
 */
export function missingE2EFixture(message: string): never {
  if (process.env.E2E_FIXTURES_REQUIRED === "1") {
    throw new Error(`Required E2E fixture missing: ${message}`);
  }
  test.skip(true, message);
  // Playwright's runtime skip interrupts the test. This keeps the return type
  // honest if that behavior ever changes.
  throw new Error(`Playwright did not skip after missing fixture: ${message}`);
}

// Every serious/critical finding fails the suite. Keep the set explicit so a
// future exception requires a visible code review instead of a hidden filter.
const ADVISORY_RULES = new Set<string>([]);
const REQUIRED_BEST_PRACTICE_RULES = new Set(["region"]);

/**
 * Runs axe-core against the current page state. Fails the test on any
 * violation of impact "serious" or "critical", plus explicitly required
 * landmark best practices (except ADVISORY_RULES); everything else is logged.
 */
export async function axeCheck(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();

  const blocking = violations.filter(
    (v) =>
      (v.impact === "serious" ||
        v.impact === "critical" ||
        REQUIRED_BEST_PRACTICE_RULES.has(v.id)) &&
      !ADVISORY_RULES.has(v.id),
  );
  const advisory = violations.filter((v) => !blocking.includes(v));

  for (const v of advisory) {
    console.log(
      `[axe] non-blocking ${v.impact ?? "unknown"} violation on ${page.url()}: ` +
        `${v.id} — ${v.help} (${v.nodes.length} node(s))`,
    );
  }

  expect(
    blocking.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.map((n) => n.target.join(" ")),
    })),
    "serious/critical axe violations and required landmark checks must be empty",
  ).toEqual([]);
}

/** Saves a full-page screenshot to e2e/screenshots/{project}/{name}.png. */
export async function fullPageScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  // Chromium otherwise preserves content-visibility skipping while capturing
  // outside the viewport, producing a misleading full-page image with blank
  // sections. Reveal them only for the visual artifact, then restore runtime
  // behavior for any assertions that follow.
  const revealDeferred = await page.addStyleTag({
    content:
      ".defer-offscreen { content-visibility: visible !important; contain-intrinsic-size: none !important; }",
  });
  try {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: path.join(__dirname, "screenshots", testInfo.project.name, `${name}.png`),
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    await revealDeferred.evaluate((style) => style.parentNode?.removeChild(style));
  }
}

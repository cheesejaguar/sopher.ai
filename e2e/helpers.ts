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
 * Rules whose violations are reported but do not fail the test, regardless of
 * impact. "color-contrast" is currently on this list because the app's oklch
 * palette has known serious contrast findings (e.g. Base UI badge/secondary
 * hover text) that live in src/ — re-tighten this once the palette is fixed.
 */
// Contrast issues were fixed app-side (tokens + tab trigger); nothing is
// advisory anymore — every serious/critical finding fails the suite.
const ADVISORY_RULES = new Set<string>([]);

/**
 * Runs axe-core against the current page state. Fails the test on any
 * violation of impact "serious" or "critical" (except ADVISORY_RULES);
 * everything else is logged to the test output but tolerated.
 */
export async function axeCheck(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();

  const blocking = violations.filter(
    (v) => (v.impact === "serious" || v.impact === "critical") && !ADVISORY_RULES.has(v.id),
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
    "serious/critical axe violations must be empty",
  ).toEqual([]);
}

/** Saves a full-page screenshot to e2e/screenshots/{project}/{name}.png. */
export async function fullPageScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await page.screenshot({
    path: path.join(__dirname, "screenshots", testInfo.project.name, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

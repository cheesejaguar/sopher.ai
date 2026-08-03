/**
 * Focused accessibility modes that axe cannot model on its own.
 *
 * Reflow widths use a 1280px reference viewport, matching the WCAG 1.4.10
 * browser-zoom check: 640 CSS px is the effective width at 200% and 320 CSS px
 * is the effective width at 400%. Testing those effective viewports exercises
 * responsive reflow instead of applying a visual-only page scale.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers";

const REFLOW_ROUTES = ["/", "/pricing", "/guides/how-book-generation-works"] as const;
const REFLOW_LEVELS = [
  { percent: 200, width: 640, height: 450 },
  { percent: 400, width: 320, height: 225 },
] as const;

async function focusWithKeyboard(page: Page, target: Locator): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }

  throw new Error("Target was not reachable in the first 12 keyboard tab stops");
}

async function expectForcedColorsCurrentState(target: Locator): Promise<void> {
  await expect(target).toHaveAttribute("aria-current", /^(page|location|step)$/);
  // The first dev-server request may stream markup before the compiled
  // forced-colors stylesheet arrives. Poll the rendered cue rather than
  // sampling that brief unstyled interval.
  await expect
    .poll(() => target.evaluate((element) => getComputedStyle(element).textDecorationLine))
    .toContain("underline");
}

async function expectNoPageOverflow(page: Page, context: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const dimensions = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });

  expect(
    dimensions.scrollWidth,
    `${context} has page-level horizontal overflow`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test("forced colors preserve keyboard focus and current-state cues", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/pricing");

  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);

  await page.getByRole("button", { name: "Open main menu" }).click();
  const pricing = page.getByRole("dialog").getByRole("link", { name: "Pricing", exact: true });
  await expectForcedColorsCurrentState(pricing);
  await focusWithKeyboard(page, pricing);
  await expect(pricing).toBeFocused();

  const focusIndicator = await pricing.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusIndicator.outlineStyle).toBe("solid");
  expect(focusIndicator.outlineWidth).toBeGreaterThanOrEqual(2);

  await page.goto("/guides/how-book-generation-works");
  await page.getByRole("button", { name: "Open main menu" }).click();
  const guides = page.getByRole("dialog").getByRole("link", { name: "Guides", exact: true });
  await expect(guides).toHaveAttribute("aria-current", "location");
  await expectForcedColorsCurrentState(guides);

  await page.goto("/");
  const currentJourneyStage = page
    .getByRole("navigation", { name: "Five-stage story journey" })
    .locator('[aria-current="step"]');
  await expect(currentJourneyStage).toHaveCount(1);
  await expectForcedColorsCurrentState(currentJourneyStage);
});

for (const level of REFLOW_LEVELS) {
  test(`${level.percent}% zoom-equivalent public pages reflow without page overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: level.width, height: level.height });

    for (const route of REFLOW_ROUTES) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("#main-content")).toBeVisible();
      await expectNoPageOverflow(page, `${route} at ${level.percent}% zoom equivalent`);
    }
  });
}

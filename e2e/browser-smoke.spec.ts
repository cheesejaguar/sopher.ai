/**
 * Focused cross-engine smoke coverage. Keep this deliberately small so CI can
 * prove Firefox/WebKit compatibility without tripling the Chromium suite.
 */
import { expect, test } from "./helpers";

for (const route of ["/", "/pricing", "/guides"] as const) {
  test(`${route} renders its primary content`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.ok()).toBe(true);
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

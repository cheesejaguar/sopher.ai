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

test("the native skip link focuses the main region", async ({ page }) => {
  await page.goto("/");
  const main = page.locator("#main-content");
  await expect(main).toBeVisible();

  const skipNavigation = page.getByRole("navigation", { name: "Skip links" });
  const skip = skipNavigation.getByRole("link", { name: "Skip to main content" });
  // WebKit follows Safari's system Full Keyboard Access preference, which can
  // intentionally omit links from sequential Tab navigation. Chromium covers
  // first-tab order; this cross-engine smoke isolates native activation.
  await skip.focus();
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(main).toBeFocused();
});

test("mobile End reaches the footer after deferred sections settle", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("End");
  await page.waitForFunction(
    () => document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) <= 1,
  );

  const footer = page.locator("footer");
  await expect(footer).toBeVisible();
  const footerBox = await footer.boundingBox();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.y).toBeLessThan(720);
});

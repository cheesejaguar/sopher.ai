/**
 * Public responsive acceptance: exact overflow probes plus mobile a11y.
 * DB-free and safe for CI.
 */
import { axeCheck, expect, fullPageScreenshot, test } from "./helpers";

const ROUTES = ["/", "/pricing", "/guides/how-book-generation-works"] as const;
const VIEWPORTS = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 960 },
] as const;

for (const route of ROUTES) {
  test(`${route} reflows without page-level horizontal scrolling`, async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(route);
      await page.locator("body").waitFor();

      const dimensions = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
        };
      });

      expect(
        dimensions.scrollWidth,
        `${route} overflowed at ${viewport.width}px`,
      ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    }
  });
}

test("mobile homepage exposes its core offer and passes axe", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/sentence|book/i);
  await expect(page.getByRole("link", { name: /start.*book/i }).first()).toBeVisible();
  await axeCheck(page);
  await fullPageScreenshot(page, testInfo, "home-390");
});

test("mobile main menu closes after client-side navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const menu = page.locator("header details");
  await menu.locator("summary").click();
  await expect(menu).toHaveAttribute("open", "");
  await page.getByRole("link", { name: "Pricing", exact: true }).click();

  await expect(page).toHaveURL(/\/pricing$/);
  await expect(menu).not.toHaveAttribute("open", "");
});

test("mobile long-form guide keeps readable navigation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/guides/how-book-generation-works");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const disclosure = page.locator("details").filter({ hasText: "On this page" }).first();
  const summary = disclosure.locator("summary");
  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("open", "");

  const tableOfContents = disclosure.getByRole("navigation", { name: "On this page" });
  const firstSection = tableOfContents.getByRole("link").first();
  await expect(firstSection).toBeVisible();
  await firstSection.focus();
  await expect(firstSection).toBeFocused();

  await axeCheck(page);
  await fullPageScreenshot(page, testInfo, "guide-390");
});

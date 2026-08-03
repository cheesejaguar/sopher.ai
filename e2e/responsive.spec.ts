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
  await expect(page.getByText(/first short story is included/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /start.*book/i }).first()).toBeVisible();
  await axeCheck(page);
  await fullPageScreenshot(page, testInfo, "home-390");
});

test("mobile homepage keeps the transforming notebook in the first viewport", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 686 },
    { width: 375, height: 812 },
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    const hero = page.locator(".marketing-hero-stage");
    const primaryAction = hero.getByRole("link", { name: "Start your book" });
    const artifact = hero.locator(".journey-artifact");
    // Wait for the same-URL reload to settle before measuring. The count
    // assertions still fail on a durable duplicate, while avoiding a strict
    // locator failure against a transient outgoing tree under throttled CI.
    await expect(hero).toHaveCount(1);
    await expect(artifact).toHaveCount(1);
    await expect(primaryAction).toBeVisible();
    await expect(artifact).toBeVisible();

    const [actionBox, artifactBox] = await Promise.all([
      primaryAction.boundingBox(),
      artifact.boundingBox(),
    ]);
    expect(actionBox, `primary action missing at ${viewport.width}px`).not.toBeNull();
    expect(artifactBox, `notebook artifact missing at ${viewport.width}px`).not.toBeNull();

    expect(
      actionBox!.y + actionBox!.height,
      `primary action falls below the first viewport at ${viewport.width}px`,
    ).toBeLessThanOrEqual(viewport.height);

    const visibleArtifactHeight = Math.max(
      0,
      Math.min(artifactBox!.y + artifactBox!.height, viewport.height) - Math.max(artifactBox!.y, 0),
    );
    expect(
      visibleArtifactHeight,
      `notebook artifact has no meaningful first-viewport presence at ${viewport.width}px`,
    ).toBeGreaterThanOrEqual(80);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  }
});

test("mobile main menu closes after navigation and restores focus after Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Open main menu" });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("dialog").getByRole("link", { name: "Pricing", exact: true }).click();

  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("public pages reflow at 200% text size", async ({ page }) => {
  for (const route of ["/", "/pricing", "/guides/how-book-generation-works"] as const) {
    for (const viewport of [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto(route);
      await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );

      const dimensions = await page.evaluate(() => {
        const clientWidth = document.documentElement.clientWidth;
        return {
          clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          offenders: [...document.querySelectorAll<HTMLElement>("body *")]
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                className: element.className.toString().slice(0, 100),
                text: element.textContent?.trim().slice(0, 60) ?? "",
                left: Math.round(rect.left),
                right: Math.round(rect.right),
              };
            })
            .filter(({ left, right }) => left < -1 || right > clientWidth + 1)
            .slice(0, 8),
        };
      });
      expect(
        dimensions.scrollWidth,
        `${route} overflowed at 200% text and ${viewport.width}px: ${JSON.stringify(dimensions.offenders)}`,
      ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    }
  }
});

test("mobile story journey changes stages without shifting its frame", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const journey = page.getByRole("navigation", { name: "Five-stage story journey" });
  await expect(journey).toBeVisible();
  const initial = await journey.boundingBox();
  await page.waitForTimeout(2_600);
  const advanced = await journey.boundingBox();

  expect(initial).not.toBeNull();
  expect(advanced).not.toBeNull();
  expect(Math.abs(advanced!.height - initial!.height)).toBeLessThanOrEqual(1);
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

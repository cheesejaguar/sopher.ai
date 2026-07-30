/**
 * DB-backed responsive product acceptance. These tests are opt-in with
 * E2E_DB=1 and perform read-only navigation against the configured local test
 * environment.
 */
import { axeCheck, expect, fullPageScreenshot, missingE2EFixture, test } from "./helpers";

const PRODUCT_VIEWPORTS = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 900 },
] as const;

async function firstProjectHref(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/studio");
  const project = page.locator('a[href^="/projects/"]').first();
  try {
    await project.waitFor({ state: "attached", timeout: 12_000 });
  } catch {
    missingE2EFixture("no project card is available on the Studio dashboard");
  }
  const href = await project.getAttribute("href");
  if (!href) missingE2EFixture("the first Studio project card has no href");
  return href;
}

async function expectNoPageOverflow(page: import("@playwright/test").Page, surface: string) {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${surface} has page-level overflow`).toBeLessThanOrEqual(1);
}

test("private Studio, project, and Admin surfaces remain noindex", async ({ page }) => {
  const href = await firstProjectHref(page);
  const projectBase = href.replace(
    /\/(brief|outline|bible|write|editor|manuscript|usage|settings)$/,
    "",
  );

  for (const route of ["/studio", `${projectBase}/write`, "/admin"]) {
    await page.goto(route);
    await expect(page.locator('meta[name="robots"]'), `${route} must stay private`).toHaveAttribute(
      "content",
      /noindex/,
    );
  }
});

for (const viewport of PRODUCT_VIEWPORTS) {
  test(`Studio, project, manuscript, and Admin reflow at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const href = await firstProjectHref(page);
    const base = href.replace(
      /\/(brief|outline|bible|write|editor|manuscript|usage|settings)$/,
      "",
    );

    const surfaces = [
      {
        name: "Studio",
        route: "/studio",
        ready: () => page.getByRole("heading", { level: 1, name: "Your books" }),
      },
      {
        name: "Admin",
        route: "/admin",
        ready: () => page.getByRole("heading", { level: 1, name: "Overview" }),
      },
      {
        name: "project brief",
        route: `${base}/brief`,
        ready: () => page.getByText("The brief, as written", { exact: true }),
      },
      {
        name: "story bible",
        route: `${base}/bible`,
        ready: () => page.getByRole("heading", { name: "Story bible" }),
      },
      {
        name: "write",
        route: `${base}/write`,
        ready: () => page.getByRole("heading", { name: "Write" }),
      },
      {
        name: "editor recovery",
        route: `${base}/editor`,
        ready: () => page.getByRole("heading", { name: "Editorial workbench" }),
      },
      {
        name: "manuscript",
        route: `${base}/manuscript`,
        ready: () => page.getByRole("region", { name: "Manuscript chapters" }),
      },
    ] as const;

    for (const surface of surfaces) {
      await page.goto(surface.route);
      await expect(surface.ready()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("#main-content")).toHaveCount(1);
      await expect(page.locator("#main-content")).toBeVisible();
      await expectNoPageOverflow(page, `${surface.name} at ${viewport.width}px`);
      if (viewport.width === 390) {
        await axeCheck(page);
        await fullPageScreenshot(
          page,
          testInfo,
          `${surface.name.toLowerCase().replaceAll(" ", "-")}-390`,
        );
      }
    }
  });
}

for (const viewport of [
  { width: 768, height: 1024, label: "tablet" },
  { width: 1440, height: 900, label: "desktop" },
] as const) {
  test(`${viewport.label} editor renders the full manuscript workbench`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const href = await firstProjectHref(page);
    const base = href.replace(
      /\/(brief|outline|bible|write|editor|manuscript|usage|settings)$/,
      "",
    );

    await page.goto(`${base}/editor`);
    const draftedChapter = page.locator('a[href*="/editor/"]').first();
    try {
      await draftedChapter.waitFor({ state: "visible", timeout: 12_000 });
    } catch {
      missingE2EFixture("the first project has no drafted chapter");
    }
    await draftedChapter.click();
    await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("complementary", { name: "Chapter overview" }),
      "the project shell must yield chapter navigation to the editor",
    ).toHaveCount(0);
    if (viewport.label === "desktop") {
      await expect(
        page.getByRole("navigation", { name: "Chapters" }),
        "the wide editor should expose exactly one chapter navigator",
      ).toHaveCount(1);
    }
    await expectNoPageOverflow(page, `${viewport.label} editor`);
    await axeCheck(page);
    await fullPageScreenshot(page, testInfo, `editor-${viewport.label}`);
  });
}

test("mobile project lifecycle navigation collapses after selection", async ({ page }) => {
  const href = await firstProjectHref(page);
  const base = href.replace(/\/(brief|outline|bible|write|editor|manuscript|usage|settings)$/, "");

  await page.goto(`${base}/brief`);
  const lifecycle = page.getByRole("navigation", { name: "Project lifecycle" });
  await lifecycle.getByText("Project navigation", { exact: true }).click();
  await lifecycle.getByRole("link", { name: "Outline" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/outline$`));
  await expect(lifecycle.getByText("You are here: Plan / Outline", { exact: true })).toBeVisible();
  await expect(lifecycle.getByText(/^Production now:/)).toBeVisible();
  await expect(lifecycle.getByRole("link", { name: "Brief" })).not.toBeVisible();
});

test("mobile editor loads the real editable manuscript instead of an interstitial", async ({
  page,
}, testInfo) => {
  const href = await firstProjectHref(page);
  const base = href.replace(/\/(brief|outline|bible|write|editor|manuscript|usage|settings)$/, "");

  await page.goto(`${base}/editor`);
  const draftedChapter = page.locator('a[href*="/editor/"]').first();
  try {
    await draftedChapter.waitFor({ state: "visible", timeout: 12_000 });
  } catch {
    missingE2EFixture("the first project has no drafted chapter");
  }
  await draftedChapter.click();
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/desktop browser/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Choose a chapter" }).click();
  await expect(page.getByRole("heading", { name: "Choose a chapter" })).toBeAttached();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: /^Suggestions/ }).click();
  await expect(page.getByRole("heading", { name: "Suggestions" }).first()).toBeAttached();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Find and replace" }).click();
  await expect(page.getByRole("heading", { name: "Find and replace" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  const selectionTools = page.getByRole("button", { name: /Edit the selected passage with AI/ });
  await expect(selectionTools).toBeEnabled();
  await selectionTools.click();
  await expect(page.getByRole("heading", { name: "Edit selected passage" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 500 });
  await editor.click();
  await expect(page.getByRole("toolbar", { name: "Chapter editing tools" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "editor has page-level overflow").toBeLessThanOrEqual(1);
  await axeCheck(page);
  await fullPageScreenshot(page, testInfo, "editor-mobile");
});

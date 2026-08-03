/**
 * DB-backed responsive product acceptance. These tests are opt-in with
 * E2E_DB=1 and perform read-only navigation against the configured local test
 * environment.
 */
import { axeCheck, expect, fullPageScreenshot, missingE2EFixture, test } from "./helpers";

test.beforeEach(() => {
  // These read-only acceptance cases intentionally render several
  // server-derived routes against an isolated remote Neon branch. Keep the
  // timeout above the shared 60-second default so low-capacity preview
  // databases cannot turn otherwise healthy route matrices into flaky gates.
  test.setTimeout(120_000);
});

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
    const projectId = base.split("/").filter(Boolean).at(-1);
    if (!projectId) throw new Error(`Could not derive a project id from ${base}`);

    const surfaces = [
      {
        name: "Studio",
        route: "/studio",
        ready: () => page.getByRole("heading", { level: 1, name: "Your books" }),
      },
      {
        name: "account settings",
        route: "/studio/settings",
        ready: () => page.getByRole("heading", { name: "Book email notifications" }),
      },
      {
        name: "Admin",
        route: "/admin",
        ready: () => page.getByRole("heading", { level: 1, name: "Overview" }),
      },
      {
        name: "Admin book reader",
        route: `/admin/books/${projectId}`,
        ready: () => page.getByRole("region", { name: "Manuscript" }),
      },
      {
        name: "project brief",
        route: `${base}/brief`,
        ready: () =>
          page.locator("#main-content").getByText("The brief, as written", { exact: true }),
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
        route: `${base}/manuscript?chapter=2`,
        ready: () => page.getByRole("region", { name: "Manuscript chapters" }),
      },
    ] as const;

    for (const surface of surfaces) {
      await page.goto(surface.route);
      await expect(surface.ready()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("#main-content")).toHaveCount(1);
      await expect(page.locator("#main-content")).toBeVisible();
      await expectNoPageOverflow(page, `${surface.name} at ${viewport.width}px`);
      const prose = page.locator(".prose-manuscript");
      if ((await prose.count()) > 0) {
        await expect(
          prose.locator("pre"),
          `${surface.name} must recover uniformly indented chapter prose instead of rendering a code block`,
        ).toHaveCount(0);
        const localOverflow = await prose.evaluateAll((nodes) =>
          nodes.map((node) => node.scrollWidth - node.clientWidth),
        );
        expect(
          Math.max(...localOverflow),
          `${surface.name} manuscript content overflows its own reading column`,
        ).toBeLessThanOrEqual(1);

        if (surface.name === "Admin book reader" || surface.name === "manuscript") {
          const recoveredParagraph = page
            .locator("#main-content")
            .getByText(
              "The stair ended in a circular chamber lined with brass shelves. Each shelf held a glass tile etched with a different street, bridge, or rooftop from Bellweather.",
              { exact: true },
            );
          await expect(recoveredParagraph).toBeVisible();
          const paragraphLayout = await recoveredParagraph.evaluate((node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return {
              whiteSpace: style.whiteSpace,
              left: rect.left,
              right: rect.right,
              viewportWidth: document.documentElement.clientWidth,
            };
          });
          expect(paragraphLayout.whiteSpace).not.toBe("pre");
          expect(paragraphLayout.whiteSpace).not.toBe("nowrap");
          expect(paragraphLayout.left).toBeGreaterThanOrEqual(-1);
          expect(paragraphLayout.right).toBeLessThanOrEqual(paragraphLayout.viewportWidth + 1);
        }
      }
      if (
        viewport.width === 390 ||
        (viewport.width === 320 && surface.name === "Admin book reader")
      ) {
        await axeCheck(page);
        await fullPageScreenshot(
          page,
          testInfo,
          `${surface.name.toLowerCase().replaceAll(" ", "-")}-${viewport.width}`,
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
  await Promise.all([
    page.waitForURL(new RegExp(`${base}/editor/\\d+$`), { timeout: 40_000 }),
    draftedChapter.click(),
  ]);
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(/desktop browser/i)).toHaveCount(0);

  const coveredProjectLink = page.locator('#main-content a[href="/studio"]').first();
  await expect(coveredProjectLink).toBeAttached();
  await expect
    .poll(() => coveredProjectLink.evaluate((element) => Boolean(element.closest("[inert]"))), {
      message: "the full-viewport phone editor must make covered project controls inert",
    })
    .toBe(true);

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press("Tab");
    const focusEnteredCoveredProjectChrome = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(
        active?.closest("#main-content") &&
        !active.closest('[data-editor-workbench="true"]') &&
        !active.closest('[role="dialog"]'),
      );
    });
    expect(
      focusEnteredCoveredProjectChrome,
      `phone editor tab stop ${index + 1} entered covered project controls`,
    ).toBe(false);
  }

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

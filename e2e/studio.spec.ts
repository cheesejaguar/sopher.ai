/**
 * DB-backed studio pages — runs only in the dbDependent-* projects, which
 * playwright.config.ts includes when E2E_DB=1. The config requires an explicit
 * isolated E2E_DATABASE_URL before it will create these projects.
 */
import { axeCheck, expect, fullPageScreenshot, missingE2EFixture, test } from "./helpers";

test.describe("studio dashboard", () => {
  test("renders the project grid or the empty-state invitation", async ({ page }, testInfo) => {
    await page.goto("/studio");
    await expect(page.getByRole("heading", { level: 1, name: "Your books" })).toBeVisible();

    // Streamed in behind Suspense: either the empty library invitation or the
    // project grid (which always ends with the "Start a new book" card).
    const emptyState = page.getByText("Your first book starts with a brief.");
    const newBookCard = page.getByRole("link", { name: /Start a new book/ });
    await expect(emptyState.or(newBookCard).first()).toBeVisible({ timeout: 20_000 });

    await axeCheck(page);
    await fullPageScreenshot(page, testInfo, "studio-dashboard");
  });

  test("command palette opens with a labeled cmdk surface", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.getByRole("heading", { level: 1, name: "Your books" })).toBeVisible();

    await page.getByRole("button", { name: "Open command palette" }).first().click();

    const dialog = page.getByRole("dialog", { name: "Go to" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Search destinations" })).toBeVisible();
    await expect(dialog.getByRole("listbox")).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription("Jump anywhere");
    await axeCheck(page);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("studio usage", () => {
  test("renders the credit wallet and spend tables", async ({ page }, testInfo) => {
    await page.goto("/studio/usage");
    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { level: 1, name: "Usage" })).toBeVisible();

    // Wallet card streams in from the ledger.
    await expect(main.getByRole("heading", { name: "Credits" })).toBeVisible({ timeout: 20_000 });
    await expect(main.getByText("Available balance", { exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: /Buy credits/ })).toBeVisible();

    // Spend breakdowns. Queried by role: each card title is a heading, and the
    // tables carry sr-only captions that would also match a bare text query.
    await expect(main.getByRole("heading", { name: "Spend by book" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(main.getByRole("heading", { name: "Spend by role" })).toBeVisible({
      timeout: 20_000,
    });

    await axeCheck(page);
    await fullPageScreenshot(page, testInfo, "studio-usage");
  });
});

test.describe("studio account", () => {
  test("credits and settings keep the same product shell", async ({ page }, testInfo) => {
    await page.goto("/studio/credits");
    await expect(page.getByRole("heading", { level: 1, name: "Credits" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: "Add credits" })).toBeVisible();
    await axeCheck(page);
    await fullPageScreenshot(page, testInfo, "account-credits");

    await page.goto("/studio/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Generation defaults" })).toBeVisible();
    await axeCheck(page);
    await fullPageScreenshot(page, testInfo, "account-settings");
  });
});

test.describe("project management", () => {
  /** These specs exercise real data; an empty library (fresh dev DB) skips. */
  async function firstProjectOrSkip(page: import("@playwright/test").Page) {
    await page.goto("/studio");
    // Project cards are the only /projects/... links on the dashboard. Wait for
    // the Suspense-streamed grid to settle before deciding the library is empty.
    const card = page.locator('a[href^="/projects/"]').first();
    try {
      await card.waitFor({ state: "attached", timeout: 10_000 });
    } catch {
      missingE2EFixture("no project card is available on the Studio dashboard");
    }
    return card;
  }

  test("dashboard cards expose a management menu", async ({ page }) => {
    await firstProjectOrSkip(page);
    const menu = page.getByRole("button", { name: /^Actions for / }).first();
    await expect(menu).toBeAttached();
    await menu.click();
    for (const item of ["Rename", "Archive", "Delete…"]) {
      await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
    }
    await page.keyboard.press("Escape");
  });

  test("project settings stage edits shape and voice", async ({ page }, testInfo) => {
    const card = await firstProjectOrSkip(page);
    const href = await card.getAttribute("href");
    if (!href) missingE2EFixture("the first Studio project card has no href");
    const base = href.replace(
      /\/(brief|outline|bible|write|editor|manuscript|usage|settings)$/,
      "",
    );
    await page.goto(`${base}/settings`);
    await expect(page.getByRole("heading", { name: "Project settings" })).toBeVisible();
    await expect(page.getByLabel("Style guide")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save settings" })).toBeVisible();
    await fullPageScreenshot(page, testInfo, "project-settings");
  });

  test("the manuscript page can edit the book's identity", async ({ page }, testInfo) => {
    const card = await firstProjectOrSkip(page);
    const href = await card.getAttribute("href");
    if (!href) missingE2EFixture("the first Studio project card has no href");
    const base = href.replace(
      /\/(brief|outline|bible|write|editor|manuscript|usage|settings)$/,
      "",
    );
    await page.goto(`${base}/manuscript`);
    const edit = page.getByRole("button", { name: "Edit title, synopsis, and author" });
    await expect(edit).toBeVisible();
    await edit.click();
    await expect(page.getByRole("heading", { name: "Book details" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Author" })).toBeVisible();
    await page.keyboard.press("Escape");
    await fullPageScreenshot(page, testInfo, "project-manuscript");
  });

  test("lifecycle, generation, and editor surfaces retain manuscript context", async ({
    page,
  }, testInfo) => {
    const card = await firstProjectOrSkip(page);
    const href = await card.getAttribute("href");
    if (!href) missingE2EFixture("the first Studio project card has no href");
    const base = href.replace(
      /\/(brief|outline|bible|write|editor|manuscript|usage|settings)$/,
      "",
    );

    const surfaces = [
      {
        route: `${base}/brief`,
        ready: () => page.getByText("The brief, as written", { exact: true }),
        screenshot: "project-brief",
      },
      {
        route: `${base}/outline`,
        ready: () => page.getByRole("heading", { name: "Outline" }),
        screenshot: "project-outline",
      },
      {
        route: `${base}/bible`,
        ready: () => page.getByRole("heading", { name: "Story bible" }),
        screenshot: "project-bible",
      },
      {
        route: `${base}/write`,
        ready: () => page.getByRole("heading", { name: "Write" }),
        screenshot: "project-generation",
      },
      {
        route: `${base}/editor`,
        ready: () => page.getByRole("heading", { name: "Editorial workbench" }),
        screenshot: "project-editor-index",
      },
    ] as const;

    for (const surface of surfaces) {
      await page.goto(surface.route);
      await expect(surface.ready()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("navigation", { name: "Project lifecycle" })).toBeVisible();
      await fullPageScreenshot(page, testInfo, surface.screenshot);
    }
  });
});

test.describe("admin dashboard", () => {
  // dev-user is admin (bootstrapped by migration / dev fallback insert).
  test("overview renders KPIs", async ({ page }, testInfo) => {
    await page.goto("/admin");
    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "Overview" })).toBeVisible({
      timeout: 20_000,
    });
    for (const kpi of ["Users", "Revenue", "Credit liability", "Open flags"]) {
      await expect(main.getByText(kpi, { exact: true })).toBeVisible();
    }
    await axeCheck(page);
    await fullPageScreenshot(page, testInfo, "admin-overview");
  });

  test("users table lists accounts and links to detail", async ({ page }, testInfo) => {
    await page.goto("/admin/users");
    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "Users" })).toBeVisible({ timeout: 20_000 });
    const devUser = main.getByRole("link", { name: "dev-author@example.invalid" });
    await expect(devUser).toBeVisible();
    await expect(devUser).toHaveAttribute("href", "/admin/users/dev-user");
    await fullPageScreenshot(page, testInfo, "admin-users");
    await Promise.all([page.waitForURL(/\/admin\/users\/dev-user$/), devUser.click()]);
    await expect(page.getByRole("button", { name: "Adjust credits" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Suspend|Unsuspend/ })).toBeVisible();
    await fullPageScreenshot(page, testInfo, "admin-user-detail");
  });

  test("flag queue renders its empty state", async ({ page }) => {
    await page.goto("/admin/flags");
    await expect(page.getByRole("heading", { name: "Moderation flags" })).toBeVisible({
      timeout: 20_000,
    });
    await axeCheck(page);
  });
});

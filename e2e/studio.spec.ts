/**
 * DB-backed studio pages — runs only in the dbDependent-* projects, which
 * playwright.config.ts includes when E2E_DB=1 (local runs against the real
 * Neon DATABASE_URL from .env.local; CI never sets E2E_DB because the
 * neon-http driver cannot talk to a plain postgres container).
 */
import { axeCheck, expect, fullPageScreenshot, test } from "./helpers";

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
});

test.describe("studio usage", () => {
  test("renders the credit wallet and spend tables", async ({ page }, testInfo) => {
    await page.goto("/studio/usage");
    await expect(page.getByRole("heading", { level: 1, name: "Usage" })).toBeVisible();

    // Wallet card streams in from the ledger.
    await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/available/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Buy credits/ })).toBeVisible();

    // Spend breakdowns. Queried by role: each card title is a heading, and the
    // tables carry sr-only captions that would also match a bare text query.
    await expect(page.getByRole("heading", { name: "Spend by book" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: "Spend by role" })).toBeVisible({
      timeout: 20_000,
    });

    await axeCheck(page);
    await fullPageScreenshot(page, testInfo, "studio-usage");
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
      test.skip(true, "no projects in this environment");
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

  test("project settings stage edits shape and voice", async ({ page }) => {
    const card = await firstProjectOrSkip(page);
    await card.click();
    await page.locator('a[href^="/projects/"][href$="/settings"]').click();
    await expect(page.getByRole("heading", { name: "Project settings" })).toBeVisible();
    await expect(page.getByLabel("Style guide")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save settings" })).toBeVisible();
  });

  test("the manuscript page can edit the book's identity", async ({ page }) => {
    const card = await firstProjectOrSkip(page);
    await card.click();
    await page.locator('a[href^="/projects/"][href$="/manuscript"]').click();
    const edit = page.getByRole("button", { name: "Edit title, synopsis, and author" });
    await expect(edit).toBeVisible();
    await edit.click();
    await expect(page.getByRole("heading", { name: "Book details" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Author" })).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

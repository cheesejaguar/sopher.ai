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
  test("renders the monthly budget bar and spend tables", async ({ page }, testInfo) => {
    await page.goto("/studio/usage");
    await expect(page.getByRole("heading", { level: 1, name: "Usage" })).toBeVisible();

    // Budget card streams in from the DB.
    await expect(page.getByText("Resets on the 1st.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("progressbar", { name: "Monthly budget used" })).toBeVisible();
    await expect(page.getByText(/% used ·/)).toBeVisible();

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

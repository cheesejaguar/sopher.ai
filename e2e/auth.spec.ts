/**
 * Auth pages in guest mode. The E2E web server starts with empty Clerk keys,
 * so /sign-in renders the env-gated local-access card instead of the Clerk
 * widget. DB-free.
 */
import { expect, fullPageScreenshot, test } from "./helpers";

test.describe("sign-in (guest mode)", () => {
  test("shows the pending-accounts card", async ({ page }, testInfo) => {
    await page.goto("/sign-in");

    await expect(page.getByRole("heading", { name: "Local studio access" })).toBeVisible();
    await expect(page.getByText(/Authentication is disabled in this development/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore the local studio" })).toBeVisible();

    await fullPageScreenshot(page, testInfo, "sign-in-pending");
  });
});

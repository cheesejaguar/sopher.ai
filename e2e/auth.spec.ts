/**
 * Auth pages in guest mode. The E2E web server starts with empty Clerk keys,
 * so /sign-in renders the env-gated "Accounts open shortly" pending card
 * instead of the Clerk widget. DB-free.
 */
import { expect, fullPageScreenshot, test } from "./helpers";

test.describe("sign-in (guest mode)", () => {
  test("shows the pending-accounts card", async ({ page }, testInfo) => {
    await page.goto("/sign-in");

    await expect(page.getByText("Accounts open shortly")).toBeVisible();
    await expect(page.getByText("Sign-in is being provisioned")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to the studio" })).toBeVisible();

    await fullPageScreenshot(page, testInfo, "sign-in-pending");
  });
});

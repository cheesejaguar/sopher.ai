/**
 * Auth pages with Clerk intentionally absent. Public-only optimized builds
 * prove that private access fails closed; isolated DB acceptance explicitly
 * opts into the local test identity and proves that handoff separately.
 */
import { axeCheck, expect, fullPageScreenshot, test } from "./helpers";

test.describe("sign-in (guest mode)", () => {
  test("shows the deployment-appropriate account-access card", async ({ page }, testInfo) => {
    await page.goto("/sign-in");

    const isolatedDevAuth = process.env.E2E_DB === "1" && process.env.E2E_DATABASE_ISOLATED === "1";
    if (isolatedDevAuth) {
      await expect(page.getByRole("heading", { name: "Local studio access" })).toBeVisible();
      await expect(page.getByText(/Authentication is disabled in this development/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Explore the local studio" })).toBeVisible();
    } else {
      await expect(
        page.getByRole("heading", { name: "Sign-in is temporarily unavailable" }),
      ).toBeVisible();
      await expect(page.getByText(/No private project data is available/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Contact support" })).toHaveAttribute(
        "href",
        "mailto:support@sopher.ai",
      );
    }

    await fullPageScreenshot(page, testInfo, "sign-in-pending");
  });

  test("keeps the account desk within a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");

    await expect(page.locator("h1")).toHaveCount(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await axeCheck(page);
  });
});

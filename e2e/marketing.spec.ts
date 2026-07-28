/**
 * Marketing pages — landing (/) and /pricing. DB-free.
 */
import { axeCheck, expect, fullPageScreenshot, test } from "./helpers";

const TIERS = ["Draft", "Standard", "Premium"] as const;

test.describe("landing page", () => {
  test("shows hero, nav, and pricing tiers", async ({ page }, testInfo) => {
    await page.goto("/");

    // Hero headline.
    await expect(
      page.getByRole("heading", { level: 1, name: "Your brief. A finished book." }),
    ).toBeVisible();

    // Main navigation landmarks.
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "sopher.ai" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Pricing" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Start your book" })).toBeVisible();

    // Pricing section with the three tiers (tier names appear in each card's CTA).
    const pricing = page.getByRole("region", { name: "Pay per book, not per month" });
    await expect(
      pricing.getByRole("heading", { name: "Pay per book, not per month" }),
    ).toBeVisible();
    for (const tier of TIERS) {
      await expect(pricing.getByRole("link", { name: `Start with ${tier}` })).toBeVisible();
    }

    await axeCheck(page);
    await fullPageScreenshot(page, testInfo, "landing");
  });
});

test.describe("pricing page", () => {
  test("shows the three tiers and prices", async ({ page }, testInfo) => {
    await page.goto("/pricing");

    const pricing = page.getByRole("region", { name: "Pay per book, not per month" });
    await expect(
      pricing.getByRole("heading", { name: "Pay per book, not per month" }),
    ).toBeVisible();
    for (const tier of TIERS) {
      await expect(pricing.getByRole("link", { name: `Start with ${tier}` })).toBeVisible();
    }
    // One flat price per tier.
    await expect(pricing.getByText("$9.99")).toBeVisible();
    await expect(pricing.getByText("$19.99")).toBeVisible();
    await expect(pricing.getByText("$49.99")).toBeVisible();

    await axeCheck(page);
    await fullPageScreenshot(page, testInfo, "pricing");
  });
});

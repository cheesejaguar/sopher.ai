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
      page.getByRole("heading", {
        level: 1,
        name: "Any book you can imagine. Made for the people you love.",
      }),
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

  test("the brief demo is switchable by keyboard", async ({ page }) => {
    await page.goto("/");

    const examples = page.getByRole("group", {
      name: "Example books, each written from a one-sentence brief",
    });
    const mystery = examples.getByRole("button", { name: "Mystery" });
    await expect(mystery).toHaveAttribute("aria-pressed", "false");

    await mystery.click();
    await expect(mystery).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByText("A locked-room mystery set in my hometown", { exact: false }),
    ).toBeVisible();
  });

  test.describe("with motion allowed", () => {
    // The suite runs reduced-motion by default, where the demo never advances on
    // its own — so the pause affordance only needs to exist when motion is on.
    test.use({ contextOptions: { reducedMotion: "no-preference" } });

    test("auto-advancing examples can be paused (WCAG 2.2.2)", async ({ page }) => {
      await page.goto("/");

      const pause = page.getByRole("button", { name: "Pause cycling through examples" });
      await expect(pause).toBeVisible();
      await pause.click();
      await expect(
        page.getByRole("button", { name: "Resume cycling through examples" }),
      ).toBeVisible();

      // Choosing an example hands control to the reader, so auto-advance stops for good.
      await page.getByRole("button", { name: "Family memoir" }).click();
      await expect(page.getByRole("button", { name: /cycling through examples/ })).toHaveCount(0);
    });
  });

  test("a skip link is the first tab stop and targets the main region", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
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

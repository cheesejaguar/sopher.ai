/**
 * Marketing pages — landing (/) and /pricing. DB-free.
 */
import { axeCheck, expect, fullPageScreenshot, test } from "./helpers";

test.describe("landing page", () => {
  test("shows hero, nav, and pricing tiers", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page).toHaveTitle("sopher.ai — The book in your head, finally on the page.");

    // Hero headline.
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "The book in your head, finally on the page.",
      }),
    ).toBeVisible();

    // Main navigation landmarks.
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "sopher.ai" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Pricing" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Start your book" })).toBeVisible();

    // Pricing section with the credit packs.
    const pricing = page.getByRole("region", { name: "Credits, not subscriptions" });
    await expect(
      pricing.getByRole("heading", { name: "Credits, not subscriptions" }),
    ).toBeVisible();
    for (const pack of ["Starter", "Author", "Studio", "Press"]) {
      await expect(pricing.getByRole("link", { name: `Get ${pack}` })).toBeVisible();
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

    await mystery.focus();
    await expect(mystery).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(mystery).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByText("A locked-room mystery set in my hometown", { exact: false }),
    ).toBeVisible();
  });

  test("reduced motion exposes the complete production sequence", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("navigation", {
      name: "Five-stage story journey",
    });
    await expect(rail.getByRole("link", { name: /Continuity/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(rail.getByRole("button", { name: /story journey/ })).toHaveCount(0);
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

    test("the manuscript rail can be paused and controlled by keyboard", async ({ page }) => {
      await page.goto("/");
      const rail = page.getByRole("navigation", {
        name: "Five-stage story journey",
      });
      const pause = rail.getByRole("button", { name: "Pause story journey" });
      await pause.click();
      await expect(rail.getByRole("button", { name: "Resume story journey" })).toBeVisible();

      const editorStage = rail.getByRole("link", { name: /Editor/ });
      await editorStage.focus();
      await expect(editorStage).toHaveAttribute("aria-current", "step");
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
  test("shows the credit packs and per-book costs", async ({ page }, testInfo) => {
    await page.goto("/pricing");

    const pricing = page.getByRole("region", { name: "Credits, not subscriptions" });
    await expect(
      pricing.getByRole("heading", { name: "Credits, not subscriptions" }),
    ).toBeVisible();

    // The four packs, priced from the same CREDIT_PACKS the checkout sells.
    for (const pack of ["Starter", "Author", "Studio", "Press"]) {
      await expect(pricing.getByRole("link", { name: `Get ${pack}` })).toBeVisible();
    }
    await expect(pricing.getByText("$25")).toBeVisible();
    await expect(pricing.getByText("$300")).toBeVisible();

    // The welcome grant and the honest per-book cost table.
    await expect(pricing.getByText(/free credits/)).toBeVisible();
    await expect(pricing.getByRole("heading", { name: "What does a book cost?" })).toBeVisible();

    await axeCheck(page);
    await fullPageScreenshot(page, testInfo, "pricing");
  });
});

test.describe("trust pages", () => {
  test("legal pages render and the footer links to them", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("navigation", { name: "Footer" });
    for (const name of ["Terms", "Privacy", "Refunds", "Support"]) {
      await expect(footer.getByRole("link", { name })).toBeVisible();
    }

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
    await page.goto("/refunds");
    await expect(page.getByRole("heading", { name: "Refund Policy" })).toBeVisible();
    await axeCheck(page);
  });

  test("unknown routes get the styled 404", async ({ page }) => {
    await page.goto("/definitely-not-a-page");
    await expect(page.getByRole("heading", { name: /isn.t in the manuscript/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the studio" })).toBeVisible();
  });
});

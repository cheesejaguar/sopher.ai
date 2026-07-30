/**
 * New-book wizard (/studio/new) — Genre → Brief → Shape → Estimate.
 *
 * Runs only in the isolated DB-backed projects. The estimate endpoint itself
 * is pure computation, but ProductShell resolves the signed-in development
 * identity and credit balance before rendering the page.
 *
 * The wizard is never submitted — "Start the book" writes to the DB and
 * kicks off a paid generation run.
 */
import { expect, fullPageScreenshot, test } from "./helpers";

test.describe("new book wizard", () => {
  test("steps from genre to estimate without submitting", async ({ page }, testInfo) => {
    await page.goto("/studio/new");
    await expect(page.getByRole("heading", { level: 1, name: "A new book" })).toBeVisible();

    // Step 1 — Genre: pick Fantasy.
    await expect(page.getByRole("heading", { name: "Pick the shelf it belongs on" })).toBeVisible();
    const fantasy = page.getByRole("button", { name: /^Fantasy/ });
    await fantasy.click();
    await expect(fantasy).toHaveAttribute("aria-pressed", "true");
    await fullPageScreenshot(page, testInfo, "wizard-1-genre");
    // exact: true — substring matching would also hit the "Open Next.js Dev
    // Tools" button that next dev injects.
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Step 2 — Brief: more than 20 characters unlocks the next step.
    await expect(
      page.getByRole("heading", { name: "Tell the story in your own words" }),
    ).toBeVisible();
    await page
      .getByLabel("Your brief")
      .fill(
        "A reluctant cartographer discovers that the maps she draws are quietly redrawing the kingdom's real borders.",
      );
    // The counter replaces the "a few sentences is enough" hint once valid.
    await expect(page.getByText(/\d+ characters/)).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Step 3 — Shape: defaults are fine.
    await expect(page.getByRole("heading", { name: "Give the book its shape" })).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Step 4 — Estimate: three tier cards with quoted prices.
    await expect(
      page.getByRole("heading", { name: "The quote, before anything runs" }),
    ).toBeVisible();
    // Each radio's accessible name comes from its whole tier card (aria-labelledby),
    // so anchor at the start: "Draft ..." must not match "... Drafted ...".
    await expect(page.getByRole("radio")).toHaveCount(3);
    for (const tier of ["Draft", "Standard", "Premium"]) {
      await expect(page.getByRole("radio", { name: new RegExp(`^${tier}\\b`) })).toBeVisible();
    }
    // Estimate values arrive from POST /api/estimates (debounced ~350ms).
    await expect(page.getByText(/~\d+ min/).first()).toBeVisible();
    // The itemized receipt renders once the selected tier's quote is in.
    await expect(page.getByText("Total", { exact: true })).toBeVisible();
    await expect(page.getByText(/±30%/)).toBeVisible();

    await fullPageScreenshot(page, testInfo, "wizard-4-estimate");

    // The submit button exists but is deliberately never clicked:
    // submission creates DB rows and starts a paid run.
    await expect(page.getByRole("button", { name: "Start the book" })).toBeVisible();
  });
});

/**
 * Focused authenticated/private cross-engine acceptance.
 *
 * The isolated E2E server uses its seeded local identity, so these routes
 * exercise the same server-derived Studio, journey, and Help contracts as an
 * authenticated account without sending mutations or touching Clerk.
 */
import { axeCheck, expect, test } from "./helpers";

test.beforeEach(() => {
  // Cross-engine startup plus server-derived journey data can exceed the
  // shared 60-second budget on the isolated preview database.
  test.setTimeout(120_000);
});

const BRIEF_NO_RUN_PROJECT = "10101010-0000-4000-8000-000000000001";
const PARTIAL_FAILURE_PROJECT = "10101010-0000-4000-8000-000000000005";

async function expectNoPageOverflow(page: import("@playwright/test").Page, label: string) {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} has page-level horizontal overflow`).toBeLessThanOrEqual(1);
}

test("private Studio journey and Help remain operable", async ({ page }) => {
  const response = await page.goto("/studio");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "Your books" })).toBeVisible({
    timeout: 20_000,
  });

  const nextAction = page.getByRole("link", {
    name: "Review production and start: The Lantern Index",
    exact: true,
  });
  await expect(nextAction).toBeVisible();
  await expect(nextAction).toHaveAttribute("href", `/projects/${BRIEF_NO_RUN_PROJECT}/write`);
  await expectNoPageOverflow(page, "private Studio library");
  await axeCheck(page);

  const helpButton = page.getByRole("button", {
    name: "Help Guidance & support",
    exact: true,
  });
  await helpButton.focus();
  await page.keyboard.press("Enter");
  const help = page.getByRole("dialog");
  await expect(help.getByRole("heading", { name: "Help with this page" })).toBeVisible();
  await expect(help.getByRole("heading", { name: "Your first book" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(help.getByRole("heading", { name: "Help topics" })).toBeVisible();
  await axeCheck(page);
  await page.keyboard.press("Escape");
  await expect(help).not.toBeVisible();
  await expect(helpButton).toBeFocused();
});

test("private incomplete manuscript keeps its truthful recovery action", async ({ page }) => {
  const response = await page.goto(`/projects/${PARTIAL_FAILURE_PROJECT}/manuscript`);
  expect(response?.ok()).toBe(true);

  await expect(
    page.getByRole("heading", {
      name: "Production stopped before the manuscript was finished.",
    }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page
      .getByRole("heading", { name: "Next step: Resume from saved work", exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(page.getByText(/2 of 3 chapters are saved/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Manuscript chapters" })).toBeVisible();
  await expectNoPageOverflow(page, "private incomplete manuscript");
  await axeCheck(page);
});

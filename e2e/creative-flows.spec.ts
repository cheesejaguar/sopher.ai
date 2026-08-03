/**
 * Read-only acceptance for the creative-authoring surfaces added after the
 * core authoring-hardening suite. This spec is excluded from public projects
 * and its sole Playwright project exists only behind the isolated-DB guard.
 * Paid and failure APIs are fulfilled in the browser so no fixture or provider
 * state is mutated.
 */
import type { Page } from "@playwright/test";

import { axeCheck, expect, test } from "./helpers";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const MARA_ID = "66666666-6666-4666-8666-666666666661";
const ACTIVE_PROJECT_ID = "10101010-0000-4000-8000-000000000006";
const PROJECT_BASE = `/projects/${PROJECT_ID}`;
const PORTRAIT_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_DB !== "1" || process.env.E2E_DATABASE_ISOLATED !== "1",
  "Creative-flow acceptance requires the explicitly isolated E2E database.",
);

test.beforeEach(() => {
  test.setTimeout(120_000);
});

async function expectNoPageOverflow(page: Page, surface: string) {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${surface} has page-level horizontal overflow`).toBeLessThanOrEqual(1);
}

test("authoring mode stays reversible and live assembly has a complete reduced-motion state", async ({
  page,
}) => {
  await page.goto(`${PROJECT_BASE}/settings`);
  await expect(page.getByRole("heading", { name: "Project settings" })).toBeVisible({
    timeout: 20_000,
  });

  const collaborative = page.getByRole("radio", { name: /Collaborative/ });
  const autopilot = page.getByRole("radio", { name: /Autopilot/ });
  await expect(collaborative).toBeChecked();
  await autopilot.check();
  await expect(autopilot).toBeChecked();
  await collaborative.check();
  await expect(collaborative).toBeChecked();
  await expect(page.getByText(/This setting is frozen when a run starts/)).toBeVisible();
  await expectNoPageOverflow(page, "authoring-mode settings");

  await page.goto(`/projects/${ACTIVE_PROJECT_ID}/write`);
  const assembly = page
    .locator('section[aria-labelledby="book-assembly-title"]')
    .filter({ visible: true });
  await expect(
    assembly.getByRole("heading", { name: "Watch the story become a book" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(assembly.getByText("Living manuscript", { exact: true })).toBeVisible();
  await expect(assembly.getByRole("list", { name: "3-chapter manuscript assembly" })).toBeVisible();
  await expect(assembly.getByLabel(/^Chapter 1: planned$/)).toBeVisible();

  const activePage = assembly.locator(".production-book-page-active");
  await expect(activePage).toHaveCount(1);
  expect(
    await activePage.evaluate((element) => getComputedStyle(element).animationName),
    "reduced motion must leave the manuscript stack in its static final state",
  ).toBe("none");
  expect(
    await assembly
      .locator(".production-energy-track")
      .evaluate((element) => getComputedStyle(element, "::after").animationName),
    "reduced motion must disable the travelling production signal",
  ).toBe("none");
  await expectNoPageOverflow(page, "live manuscript assembly");
});

test("mobile Story Bible exposes add, canon profile, and full-image controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${PROJECT_BASE}/bible`);
  await expect(page.getByRole("heading", { name: "Story bible" })).toBeVisible({
    timeout: 20_000,
  });

  const mara = page.getByRole("article", { name: "Mara Vale" });
  await expect(mara.getByRole("heading", { name: "Physical canon" })).toBeVisible();
  await expect(mara.getByText("Ink-dark hair, practical coat, brass watch chain")).toBeVisible();
  await expect(mara.getByText("apprentice clockmaker")).toBeVisible();
  await expect(
    mara.getByText("Find her grandfather · Restore the missing river quarter"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add entry" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Add to the Story Bible" })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /Character:/ })).toBeChecked();
  await dialog.getByRole("radio", { name: /Place:/ }).click();
  await expect(dialog.getByLabel("Appearance and layout")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await mara.getByRole("button", { name: "Edit canon" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Edit Mara Vale" })).toBeVisible();
  await expect(dialog.getByLabel("Physical appearance")).toHaveValue(
    "Ink-dark hair, practical coat, brass watch chain",
  );
  await expect(dialog.getByLabel("Goals")).toHaveValue(
    "Find her grandfather\nRestore the missing river quarter",
  );
  await expect(dialog.getByLabel("Personality")).toHaveValue("observant\npersistent\nprecise");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  let portraitRequests = 0;
  await page.route(`**/api/entities/${MARA_ID}/portrait`, async (route) => {
    portraitRequests += 1;
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: PORTRAIT_DATA_URL }),
    });
  });
  await mara.getByRole("button", { name: /Generate portrait/ }).click();
  const fullImage = mara.getByRole("button", { name: "View full image of Mara Vale" });
  await expect(fullImage).toBeVisible();
  await expect(fullImage).toBeFocused();
  expect(portraitRequests).toBe(1);

  await fullImage.click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Mara Vale" })).toBeVisible();
  await expect(
    dialog.getByText("Full illustration generated from this entry's visual canon."),
  ).toBeVisible();
  await expectNoPageOverflow(page, "mobile Story Bible image dialog");
  await axeCheck(page);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(fullImage).toBeFocused();
});

test("whole-manuscript review fails safely and Book Package preserves the seeded identity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let reviewRequests = 0;
  await page.route(`**/api/projects/${PROJECT_ID}/edit-pass`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    reviewRequests += 1;
    const payload = route.request().postDataJSON() as {
      instruction?: string;
      requestKey?: string;
    };
    expect(payload.instruction).toBe(
      "Make every scene more adventurous without changing the plot.",
    );
    expect(payload.requestKey).toBeTruthy();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "The review service is temporarily unavailable." }),
    });
  });

  await page.goto(`${PROJECT_BASE}/editor`);
  await expect(page.getByRole("heading", { name: "Editorial workbench" })).toBeVisible({
    timeout: 20_000,
  });
  const direction = page
    .locator('section[aria-labelledby="manuscript-direction-heading"]')
    .filter({ visible: true });
  await expect(direction.getByText("Whole-manuscript direction", { exact: true })).toBeVisible();
  const instruction = direction.getByLabel("What should change across the book?");
  await instruction.fill("Make every scene more adventurous without changing the plot.");
  const review = direction.getByRole("button", { name: "Review the whole manuscript" });
  await review.click();
  await expect(
    direction
      .getByRole("alert")
      .filter({ hasText: "The review service is temporarily unavailable." }),
  ).toHaveText("The review service is temporarily unavailable.");
  await expect(instruction).toHaveValue(
    "Make every scene more adventurous without changing the plot.",
  );
  await expect(review).toBeEnabled();
  expect(reviewRequests).toBe(1);
  await expectNoPageOverflow(page, "mobile whole-manuscript review");
  await axeCheck(page);

  await page.goto(`${PROJECT_BASE}/book`);
  await expect(page.getByRole("heading", { name: "Build the complete book" })).toBeVisible({
    timeout: 20_000,
  });
  const titleInput = page.getByRole("textbox", { name: "Title", exact: true });
  await expect(titleInput).toHaveValue("The Clockmaker's Map");
  await expect(page.getByRole("textbox", { name: "Author byline", exact: true })).toHaveValue(
    "E2E Sample Author",
  );
  await expect(page.getByRole("textbox", { name: "Dedication", exact: true })).toHaveValue(
    "For every first draft.",
  );
  const readerOrder = page.getByRole("complementary", { name: "Reader order" });
  await expect(readerOrder).toContainText("Title page");
  await expect(readerOrder).toContainText("Dedication");
  await expect(readerOrder).toContainText("Contents");
  await expect(readerOrder).toContainText("3 chapters");
  const saveBox = await page.getByRole("button", { name: "Save book package" }).boundingBox();
  const titleBox = await titleInput.boundingBox();
  expect(saveBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(
    saveBox!.y + saveBox!.height,
    "the mobile save bar must not cover the first book-package field",
  ).toBeLessThanOrEqual(titleBox!.y);
  await expectNoPageOverflow(page, "mobile Book Package");
});

test("mobile manuscript restores reader shares and export history without creating either", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let exportHistoryRequests = 0;
  await page.route(`**/api/projects/${PROJECT_ID}/export`, async (route) => {
    expect(route.request().method(), "this acceptance path must remain read-only").toBe("GET");
    exportHistoryRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        exports: [
          {
            runId: "91919191-0000-4000-8000-000000000001",
            format: "pdf",
            status: "completed",
            error: null,
            asset: {
              id: "92929292-0000-4000-8000-000000000001",
              filename: "clockmakers-map-proof.pdf",
            },
            createdAt: "2026-08-02T18:00:00.000Z",
            completedAt: "2026-08-02T18:00:04.000Z",
            acceptanceUncertain: false,
            dispatchAttempts: 1,
          },
          {
            runId: "91919191-0000-4000-8000-000000000002",
            format: "docx",
            status: "completed",
            error: null,
            asset: {
              id: "92929292-0000-4000-8000-000000000002",
              filename: "clockmakers-map-working-copy.docx",
              incomplete: true,
            },
            incomplete: true,
            createdAt: "2026-08-01T18:00:00.000Z",
            completedAt: "2026-08-01T18:00:04.000Z",
            acceptanceUncertain: false,
            dispatchAttempts: 1,
          },
        ],
      }),
    });
  });

  await page.goto(`${PROJECT_BASE}/manuscript`);
  await expect(page.getByRole("region", { name: "Manuscript chapters" })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Share reader" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Share a reader edition" })).toBeVisible();
  await expect(dialog.getByText("Downloadable reader proof", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(dialog.getByText("Browser-only reader proof", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Revoke" })).toHaveCount(2);
  await expectNoPageOverflow(page, "mobile reader-share dialog");
  await axeCheck(page);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await page.getByRole("button", { name: "Export" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Export the manuscript" })).toBeVisible();
  await expect(dialog.getByText("Latest export restored", { exact: true })).toBeVisible();
  await expect(dialog.getByText("clockmakers-map-proof.pdf", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Recent exports" })).toBeVisible();
  await expect(dialog.getByText("Word · Ready", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/incomplete snapshot/i)).toBeVisible();
  expect(exportHistoryRequests).toBe(1);
  await expectNoPageOverflow(page, "mobile export-history dialog");
  await axeCheck(page);
});

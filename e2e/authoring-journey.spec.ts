/**
 * DB-backed acceptance for the one-truthful-next-step contract.
 *
 * Every row is seeded in scripts/seed-e2e.ts. Tests select by stable title,
 * never card order, so the shared completed manuscript remains the first
 * project used by the broader Studio suite.
 */
import fs from "node:fs/promises";
import path from "node:path";

import { axeCheck, expect, test } from "./helpers";

const PROJECTS = {
  briefNoRun: "10101010-0000-4000-8000-000000000001",
  dispatchUncertain: "10101010-0000-4000-8000-000000000002",
  outlineApproval: "10101010-0000-4000-8000-000000000003",
  creditsPause: "10101010-0000-4000-8000-000000000004",
  partialFailure: "10101010-0000-4000-8000-000000000005",
  degradedTelemetry: "10101010-0000-4000-8000-000000000006",
  cancellationRequested: "10101010-0000-4000-8000-000000000007",
  invalidCompletion: "10101010-0000-4000-8000-000000000008",
} as const;

const RUNS = {
  creditsPause: "40404040-0000-4000-8000-000000000004",
} as const;

const SCREENSHOT_DIR = path.join(process.cwd(), "output", "playwright", "authoring-hardening");

async function screenshot(
  page: import("@playwright/test").Page,
  projectName: string,
  name: string,
  fullPage = true,
) {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${projectName}-${name}.png`),
    fullPage,
    animations: "disabled",
  });
}

async function expectNoPageOverflow(page: import("@playwright/test").Page, label: string) {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} has page-level horizontal overflow`).toBeLessThanOrEqual(1);
}

test("library exposes one truthful action for every authoring state", async ({
  page,
}, testInfo) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { level: 1, name: "Your books" })).toBeVisible({
    timeout: 20_000,
  });

  const expectedActions = [
    {
      title: "The Lantern Index",
      label: "Review production and start",
      href: `/projects/${PROJECTS.briefNoRun}/write`,
      detail: "Your brief is ready.",
    },
    {
      title: "Signal at Low Tide",
      label: "Reconnect this start",
      href: `/projects/${PROJECTS.dispatchUncertain}/write`,
      detail: "did not receive a start confirmation",
    },
    {
      title: "The Map of Borrowed Roads",
      label: "Review the outline",
      href: `/projects/${PROJECTS.outlineApproval}/outline`,
      detail: "paused until you approve",
    },
    {
      title: "A Choir for Europa",
      label: "Add credits to continue",
      href: `/studio/credits?return=${encodeURIComponent(
        `/projects/${PROJECTS.creditsPause}/write`,
      )}&resumeRun=${RUNS.creditsPause}`,
      detail: "2.5 credits",
    },
    {
      title: "The Orchard Below",
      label: "Resume from saved work",
      href: `/projects/${PROJECTS.partialFailure}/write`,
      detail: "2 saved chapters",
    },
    {
      title: "The Last Weather Station",
      label: "Watch production",
      href: `/projects/${PROJECTS.degradedTelemetry}/write`,
      detail: "live connection is delayed",
    },
    {
      title: "Glasswing County",
      label: "View the safe stop",
      href: `/projects/${PROJECTS.cancellationRequested}/write`,
      detail: "stopping before another model call",
    },
    {
      title: "The House That Counted",
      label: "Contact support",
      href: /^mailto:support@sopher\.ai/,
      detail: "without a complete, verifiable manuscript",
    },
  ] as const;

  for (const expected of expectedActions) {
    const action = page.getByRole("link", {
      name: `${expected.label}: ${expected.title}`,
      exact: true,
    });
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute("href", expected.href);
    await expect(action).toContainText(expected.detail);
  }

  await expectNoPageOverflow(page, "authoring-state library");
  await axeCheck(page);
  await screenshot(page, testInfo.project.name, "journey-library");
});

test("project surfaces repeat the authoritative next step", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const surfaces = [
    {
      route: `/projects/${PROJECTS.briefNoRun}/write`,
      action: "Review production and start",
    },
    {
      route: `/projects/${PROJECTS.outlineApproval}/outline`,
      action: "Review the outline",
    },
    {
      route: `/projects/${PROJECTS.creditsPause}/write`,
      action: "Add credits to continue",
    },
    {
      route: `/projects/${PROJECTS.partialFailure}/editor`,
      action: "Resume from saved work",
    },
    {
      route: `/projects/${PROJECTS.cancellationRequested}/write`,
      action: "Stopping safely",
    },
  ] as const;

  for (const surface of surfaces) {
    await page.goto(surface.route);
    await expect(
      page
        .getByRole("heading", { name: `Next step: ${surface.action}`, exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 20_000 });
    await expectNoPageOverflow(page, surface.route);
  }

  await expect(
    page.getByRole("heading", { name: "Next step: Stopping safely" }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Book production status" })
      .getByText("Stopping safely after Chapters · 37%", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Drafting chapters/)).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Chapters at the safe stop" })).toBeVisible();
  await expect(page.getByText("Settling now", { exact: true })).toBeVisible();
  await expect(page.getByText("Writing now", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/being written/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View the safe stop" })).toHaveCount(0);
  await expect(page.getByText("Stopping", { exact: true })).toBeVisible();
  await expect(page.getByText("Generating", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stopping safely" })).toBeDisabled();
  await expect(
    page.getByText(/Your run is accepted and the writing team is being assigned/),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stop the run" })).toHaveCount(0);

  await page.goto(`/projects/${PROJECTS.creditsPause}/write`);
  await expect(page.getByText("Writing is paused — out of credits.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: "Waiting for credits" })).toBeVisible();

  await page.goto(`/projects/${PROJECTS.degradedTelemetry}/write`);
  await expect(
    page.getByRole("heading", { name: "Live updates are temporarily unavailable" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Drafting chapters" })).toBeVisible();

  await page.goto(`/projects/${PROJECTS.cancellationRequested}/write`);
  const savedDraft = page.getByRole("region", { name: "Chapter 1 saved work" });
  await expect(savedDraft).toContainText("Mara checked the brass compass twice.", {
    timeout: 20_000,
  });
  await expect(savedDraft.getByText("No prose has streamed for this chapter yet.")).toHaveCount(0);
  await screenshot(page, testInfo.project.name, "cancellation-requested");
});

test("Help and the first-book checklist work from the keyboard", async ({ page }, testInfo) => {
  await page.goto("/studio");
  const help = page.getByRole("button", { name: "Help Guidance & support", exact: true });
  await expect(help).toBeVisible();
  await help.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Help with this page" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Your first book" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(dialog.getByText(/milestones complete/)).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Help topics" })).toBeVisible();
  await expect(dialog.getByText("From idea to manuscript", { exact: true })).toBeVisible();

  await axeCheck(page);
  await screenshot(page, testInfo.project.name, "help-checklist");

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(help).toBeFocused();
});

test("mobile, forced-colors, and enlarged text keep the journey operable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto(`/projects/${PROJECTS.partialFailure}/editor`);

  const lifecycle = page.getByRole("navigation", { name: "Project lifecycle" });
  await expect(lifecycle).toBeVisible();
  await lifecycle.getByText("Project navigation", { exact: true }).click();
  await expect(
    lifecycle.getByRole("heading", { name: "Next step: Resume from saved work" }),
  ).toBeVisible();
  const forcedColorAction = lifecycle.getByRole("link", { name: "Resume from saved work" });
  await expect(forcedColorAction).toHaveCSS("border-top-style", "solid");
  await expect(forcedColorAction).toHaveCSS("border-top-width", "1px");
  await expectNoPageOverflow(page, "390px forced-colors project");
  await screenshot(page, testInfo.project.name, "mobile-forced-colors");

  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "none" });
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/studio");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(page.getByRole("heading", { level: 1, name: "Your books" })).toBeVisible();
  await expectNoPageOverflow(page, "200% text scaling");
  await axeCheck(page);

  for (const { scale, width } of [
    { scale: "200%", width: 640 },
    { scale: "400%", width: 320 },
  ] as const) {
    // Browser zoom reduces the layout viewport: 1280px at 200% and 400%
    // reflows at 640px and 320px respectively.
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/projects/${PROJECTS.partialFailure}/editor`);

    const scaledLifecycle = page.getByRole("navigation", { name: "Project lifecycle" });
    const scaledNextStep = page.getByRole("region", {
      name: "Next step: Resume from saved work",
    });
    await expect(scaledLifecycle.getByText("Project navigation", { exact: true })).toBeVisible();
    await expect(
      scaledNextStep.getByRole("link", { name: "Resume from saved work" }),
    ).toBeVisible();
    await expectNoPageOverflow(page, `${scale} project navigation reflow`);
    expect(
      await scaledNextStep.evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
      `${scale} next step clips vertically`,
    ).toBe(true);
    expect(
      await scaledLifecycle
        .locator("summary")
        .evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
      `${scale} lifecycle summary clips vertically`,
    ).toBe(true);
  }
});

test("mobile next step remains below the app bar and incomplete work stays explicit", async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${PROJECTS.partialFailure}/editor`);

  const nextStep = page.getByRole("region", {
    name: "Next step: Resume from saved work",
  });
  await expect(nextStep).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await nextStep.boundingBox())?.height ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(60);

  const incomplete = page.getByRole("heading", {
    name: "Production stopped before the manuscript was finished.",
  });
  await expect(incomplete).toBeVisible();
  await expect(page.getByText(/2 of 3 chapters are saved/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Resume from saved work" })).toHaveCount(1);
  await expectNoPageOverflow(page, "mobile incomplete editor");
  await axeCheck(page);
  await screenshot(page, testInfo.project.name, "mobile-sticky-incomplete-editor", false);

  await page.goto(`/projects/${PROJECTS.partialFailure}/manuscript`);
  await expect(
    page.getByRole("heading", {
      name: "Production stopped before the manuscript was finished.",
    }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Manuscript chapters" })).toBeVisible();
  await expect(page.getByText(/2 of 3 chapters are saved/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Resume from saved work" })).toHaveCount(1);
  await expectNoPageOverflow(page, "mobile incomplete manuscript");
  await axeCheck(page);
  await screenshot(page, testInfo.project.name, "mobile-incomplete-manuscript");

  const manuscriptNextStep = page.getByRole("region", {
    name: "Next step: Resume from saved work",
  });
  await page.mouse.wheel(0, 1_200);
  await expect
    .poll(async () => (await manuscriptNextStep.boundingBox())?.y ?? -1)
    .toBeGreaterThanOrEqual(55);
  await expect
    .poll(async () => (await manuscriptNextStep.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(57);
  await expect
    .poll(async () => (await manuscriptNextStep.boundingBox())?.height ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(60);
  await screenshot(page, testInfo.project.name, "mobile-sticky-next-step", false);

  expect(consoleErrors, "browser console errors").toEqual([]);
  expect(serverErrors, "500 responses").toEqual([]);
});

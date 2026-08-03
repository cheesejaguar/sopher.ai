/**
 * New-book wizard (/studio/new) — Genre → Brief → Shape → Estimate.
 *
 * Runs only in the isolated DB-backed projects. The estimate endpoint itself
 * is pure computation, but ProductShell resolves the signed-in development
 * identity and credit balance before rendering the page.
 *
 * This route-level smoke test stops at the final review. Server-action
 * acceptance and idempotent handoff are covered with a stubbed workflow in
 * the dedicated DB-backed start tests; this test must never start paid work.
 */
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

import { axeCheck, expect, fullPageScreenshot, test } from "./helpers";

const wizardRequestKey = (userId: string, experience: "trial_short_story" | "full_book") =>
  `sopher.new-book-request.v2:${userId}:${experience}`;
const DEV_WIZARD_REQUEST_KEY = wizardRequestKey("dev-user", "full_book");
const E2E_USER_HEADER = "x-sopher-e2e-user";
const START_HANDOFF_TIMEOUT_MS = 30_000;
const stubbedStartsEnabled =
  process.env.E2E_DATABASE_ISOLATED === "1" && process.env.E2E_STUB_WORKFLOW === "1";

type StartState = {
  projectCount: number;
  runCount: number;
  activeRunCount: number;
  distinctRequestKeyCount: number;
  projects: Array<{
    id: string;
    experience: "trial_short_story" | "full_book";
    targetChapters: number;
    targetWordsPerChapter: number;
    settings: {
      qualityTier?: string;
      requireOutlineApproval?: boolean;
    };
  }>;
  runs: Array<{
    id: string;
    projectId: string;
    requestKey: string | null;
    status: string;
    workflowRunId: string | null;
    acceptanceUncertainAt: string | null;
    acceptanceDispatchClaimedAt: string | null;
  }>;
};

async function completeWizardSetup(
  page: Page,
  title: string,
  options: { includedStory?: boolean } = {},
): Promise<void> {
  await expect(page.getByRole("heading", { name: "Pick the shelf it belongs on" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Working title").fill(title);
  await page
    .getByLabel("Your brief")
    .fill(
      "A night archivist discovers that every story removed from the city library becomes a real place no one else remembers.",
    );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  if (options.includedStory) {
    await expect(page.getByRole("heading", { name: "Shape your short story" })).toBeVisible();
    await expect(page.getByText("~1,000 words")).toBeVisible();
    await expect(page.getByRole("slider", { name: "Chapters" })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
  if (options.includedStory) {
    await expect(
      page.getByRole("heading", { name: "Review your included production" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Included production quality" })).toContainText(
      "Standard production",
    );
    await expect(page.getByText(/Estimated production time: ~\d+ min/)).toBeVisible();
    await expect(page.getByText("Total", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/One complete short story is included with your account/),
    ).toBeVisible();
    await expect(
      page.getByText(/Included short story estimate: about \d+ minutes\./),
    ).toBeAttached();
  }
  const start = page.getByRole("button", {
    name: options.includedStory ? "Create my short story" : "Start the book",
  });
  // The receipt is painted by StepEstimate before its effect publishes the
  // matching quote to the parent wizard. Waiting for both the receipt and the
  // React-owned aria-describedby transition proves hydration has attached the
  // handlers and that handleSubmit sees the authoritative quote revision.
  await expect(page.getByText("Total", { exact: true })).toBeVisible();
  await expect(start).toBeVisible();
  await expect(start).toBeEnabled();
  await expect(start).not.toHaveAttribute("aria-describedby", "wizard-quote-hint");
}

async function inspectStart(page: Page, requestKey: string): Promise<StartState> {
  const response = await page.request.get(
    `/api/internal/e2e/start-state?requestKey=${encodeURIComponent(requestKey)}`,
  );
  expect(response.status(), "the isolated start-state seam must be enabled").toBe(200);
  return (await response.json()) as StartState;
}

async function makeUncertainHandoff(page: Page, requestKey: string): Promise<{ runId: string }> {
  const response = await page.request.post("/api/internal/e2e/start-state", {
    data: { action: "make_uncertain_handoff", requestKey },
  });
  expect(response.status(), "the isolated uncertain-handoff fixture must be enabled").toBe(200);
  return (await response.json()) as { runId: string };
}

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

    // Step 2 — Brief: both the persistent working title and a meaningful
    // description are required.
    await expect(
      page.getByRole("heading", { name: "Tell the story in your own words" }),
    ).toBeVisible();
    await page.getByLabel("Working title").fill("The Cartographer's Border");
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

    await axeCheck(page);
    await fullPageScreenshot(page, testInfo, "wizard-4-estimate");

    // The submit button exists but is deliberately never clicked:
    // submission creates DB rows and starts a paid run.
    await expect(page.getByRole("button", { name: "Start the book" })).toBeVisible();
  });
});

test.describe("stubbed new-book starts", () => {
  test.skip(
    !stubbedStartsEnabled,
    "Submission coverage requires the disposable DB and explicit Workflow stub gate.",
  );

  test("submits the fixed included story through a verified non-Admin account", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "dbWizard-light",
      "One disposable identity is enough to cover the included-story path.",
    );
    const userId = `e2e-trial-${randomUUID()}`;
    const requestKey = randomUUID();
    const title = `Included Story ${requestKey.slice(0, 8)}`;
    await page.context().setExtraHTTPHeaders({ [E2E_USER_HEADER]: userId });

    await page.goto("/studio/new?genre=fantasy");
    await expect(
      page.getByRole("heading", { level: 1, name: "Your included short story" }),
    ).toBeVisible();
    await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
      key: wizardRequestKey(userId, "trial_short_story"),
      value: requestKey,
    });
    await completeWizardSetup(page, title, { includedStory: true });
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByText("Included", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Create my short story" }).click();

    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/write$/);
    await expect
      .poll(async () => inspectStart(page, requestKey))
      .toMatchObject({
        projectCount: 1,
        runCount: 1,
        activeRunCount: 1,
        projects: [
          {
            experience: "trial_short_story",
            targetChapters: 3,
            targetWordsPerChapter: 1_000,
            settings: {
              qualityTier: "standard",
              requireOutlineApproval: true,
            },
          },
        ],
      });
    const acceptedStart = await inspectStart(page, requestKey);
    const acceptedProjectId = acceptedStart.projects[0]?.id;
    expect(acceptedProjectId).toBeTruthy();
    if (!acceptedProjectId) throw new Error("The included-story start did not persist a project");

    await page.goto("/studio/new");
    await expect(
      page.getByRole("heading", { name: "Your included story is already in Studio" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Open my included story" })).toHaveAttribute(
      "href",
      `/projects/${acceptedProjectId}/write`,
    );
    await expect(page.getByRole("link", { name: "Take this story to full length" })).toHaveCount(0);
    await axeCheck(page);
  });

  test("retries an uncertain handoff on the same run while stream health reconnects", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "dbWizard-light",
      "One isolated browser identity is enough to cover handoff recovery.",
    );
    const userId = `e2e-trial-${randomUUID()}`;
    const requestKey = randomUUID();
    const title = `Uncertain Handoff ${requestKey.slice(0, 8)}`;
    await page.context().setExtraHTTPHeaders({ [E2E_USER_HEADER]: userId });

    await page.goto("/studio/new?genre=mystery");
    await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
      key: wizardRequestKey(userId, "trial_short_story"),
      value: requestKey,
    });
    await completeWizardSetup(page, title, { includedStory: true });
    await page.getByRole("button", { name: "Create my short story" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/write$/);

    await expect
      .poll(async () => inspectStart(page, requestKey))
      .toMatchObject({
        projectCount: 1,
        runCount: 1,
        activeRunCount: 1,
        runs: [{ requestKey, status: "queued", workflowRunId: null }],
      });
    const initial = await inspectStart(page, requestKey);
    const runId = initial.runs[0]?.id;
    expect(runId).toBeTruthy();
    if (!runId) throw new Error("The accepted E2E start did not persist a run id");

    await expect(makeUncertainHandoff(page, requestKey)).resolves.toMatchObject({ runId });
    await page.reload();

    await expect(
      page.getByRole("heading", { name: "Confirm this same writing run" }),
    ).toBeVisible();
    const retry = page.getByRole("button", { name: "Retry this same start" });
    await expect(retry).toBeEnabled();
    const reconnectingStatus = page
      .getByRole("status")
      .filter({ hasText: /Connection:\s*reconnecting/ });
    await expect(reconnectingStatus).toBeVisible();
    await expect(
      page.getByText(
        "Live notes are reconnecting. Production status is still checked every five seconds.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Writing didn’t begin." })).toHaveCount(0);
    await expect(page.getByText("Progress", { exact: true }).locator("..")).toContainText("0%");

    await retry.click();
    await expect(
      page.getByRole("status").filter({
        hasText: "Production handoff confirmed. Status will update automatically.",
      }),
    ).toBeVisible();

    await expect
      .poll(async () => inspectStart(page, requestKey))
      .toMatchObject({
        projectCount: 1,
        runCount: 1,
        activeRunCount: 1,
        distinctRequestKeyCount: 1,
        runs: [
          {
            id: runId,
            requestKey,
            status: "queued",
            workflowRunId: null,
            acceptanceUncertainAt: null,
            acceptanceDispatchClaimedAt: null,
          },
        ],
      });
    await expect(page.getByRole("heading", { name: "Confirm this same writing run" })).toHaveCount(
      0,
    );
    await expect(reconnectingStatus).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Preparing the writing room" })
        .getByText("Production now", { exact: true }),
    ).toBeVisible();
    await axeCheck(page);
  });

  test("reattaches duplicate activation and reload without duplicate projects or runs", async ({
    page,
  }, testInfo) => {
    const requestKey = randomUUID();
    const title = `Idempotent Start ${testInfo.project.name} ${requestKey.slice(0, 8)}`;

    await page.goto("/studio/new?genre=mystery");
    await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
      key: DEV_WIZARD_REQUEST_KEY,
      value: requestKey,
    });
    await completeWizardSetup(page, title);

    // Two activations in the same browser task exercise the durable request
    // key before React has a chance to paint the pending state.
    const start = page.getByRole("button", { name: "Start the book" });
    await start.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });

    await expect
      .poll(async () => inspectStart(page, requestKey), {
        timeout: START_HANDOFF_TIMEOUT_MS,
        message: "the duplicate activation must persist one authoritative project and run",
      })
      .toMatchObject({
        projectCount: 1,
        runCount: 1,
        activeRunCount: 1,
        distinctRequestKeyCount: 1,
        runs: [{ requestKey, status: "queued", workflowRunId: null }],
      });
    const persistedStart = await inspectStart(page, requestKey);
    const persistedProjectId = persistedStart.projects[0]?.id;
    expect(persistedProjectId).toBeTruthy();
    if (!persistedProjectId) throw new Error("The idempotent start did not persist a project id");
    const firstWritePath = `/projects/${persistedProjectId}/write`;
    const firstWriteUrl = new URL(firstWritePath, page.url()).toString();
    await expect(page).toHaveURL(firstWriteUrl, { timeout: START_HANDOFF_TIMEOUT_MS });

    await page.reload();
    await expect(page).toHaveURL(firstWriteUrl, { timeout: START_HANDOFF_TIMEOUT_MS });
    await expect(
      page.getByLabel("Book production status").getByText("Production now", { exact: true }),
    ).toBeVisible();
    await axeCheck(page);
    await expect(inspectStart(page, requestKey)).resolves.toMatchObject({
      projectCount: 1,
      runCount: 1,
      activeRunCount: 1,
      distinctRequestKeyCount: 1,
    });

    // Replaying the same wizard request after a reload must attach to the same
    // durable project/run instead of consuming a second creation.
    await page.goto("/studio/new?genre=mystery");
    await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
      key: DEV_WIZARD_REQUEST_KEY,
      value: requestKey,
    });
    await completeWizardSetup(page, title);
    await page.getByRole("button", { name: "Start the book" }).click();
    await expect(page).toHaveURL(firstWriteUrl, { timeout: START_HANDOFF_TIMEOUT_MS });
    await expect(inspectStart(page, requestKey)).resolves.toMatchObject({
      projectCount: 1,
      runCount: 1,
      activeRunCount: 1,
      distinctRequestKeyCount: 1,
    });
  });

  test("shows a truthful zero-work failure and retries on the saved project", async ({
    page,
  }, testInfo) => {
    const requestKey = randomUUID();
    const title = `Recoverable Start ${testInfo.project.name} ${requestKey.slice(0, 8)}`;

    await page.goto("/studio/new?genre=mystery&e2eStartMode=fail_before_work");
    await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
      key: DEV_WIZARD_REQUEST_KEY,
      value: requestKey,
    });
    await completeWizardSetup(page, title);
    await page.getByRole("button", { name: "Start the book" }).click();

    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/write$/);
    await expect(page.getByRole("heading", { name: "Writing didn’t begin." })).toBeVisible();
    await expect(page.getByText(/No credits were used\./)).toBeVisible();
    await axeCheck(page);
    await expect(inspectStart(page, requestKey)).resolves.toMatchObject({
      projectCount: 1,
      runCount: 1,
      activeRunCount: 0,
      distinctRequestKeyCount: 1,
      runs: [{ requestKey, status: "failed", workflowRunId: null }],
    });

    await page.getByRole("button", { name: "Try starting again", exact: true }).click();
    await expect(
      page.getByLabel("Book production status").getByText("Production now", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Book production status").getByLabel("0 percent complete"),
    ).toBeVisible();

    await expect
      .poll(async () => inspectStart(page, requestKey))
      .toMatchObject({
        projectCount: 1,
        runCount: 2,
        activeRunCount: 1,
        distinctRequestKeyCount: 2,
        runs: [
          { requestKey, status: "failed", workflowRunId: null },
          { status: "queued", workflowRunId: null },
        ],
      });
  });
});

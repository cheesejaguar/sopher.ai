/**
 * Destructive editor acceptance for an isolated, deterministically seeded
 * fixture database.
 *
 * Opt in with both E2E_DB=1 and E2E_EDITOR_MUTATIONS=1. Re-seed before each
 * suite run: the suggestion tests intentionally resolve their pending rows.
 * The explicit isolation guard in playwright.config.ts keeps every mutation
 * away from shared preview and development data.
 */
import { expect, missingE2EFixture, test } from "./helpers";

async function openFirstDraftedChapter(page: import("@playwright/test").Page) {
  await page.goto("/studio");
  const project = page.locator('a[href^="/projects/"]').first();
  try {
    await project.waitFor({ state: "attached", timeout: 12_000 });
  } catch {
    missingE2EFixture("no project card is available on the Studio dashboard");
  }
  const href = await project.getAttribute("href");
  if (!href) missingE2EFixture("the first Studio project card has no href");
  const base = href.replace(/\/(brief|outline|bible|write|editor|manuscript|usage|settings)$/, "");
  await page.goto(`${base}/editor`);
  const chapter = page.locator('a[href*="/editor/"]').first();
  try {
    await chapter.waitFor({ state: "visible", timeout: 12_000 });
  } catch {
    missingE2EFixture("the first project has no drafted chapter");
  }
  await chapter.click();
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible({ timeout: 20_000 });
  return { url: page.url(), editor };
}

async function appendAtDocumentEnd(
  page: import("@playwright/test").Page,
  editor: import("@playwright/test").Locator,
  text: string,
) {
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

async function waitForSaved(page: import("@playwright/test").Page) {
  const saved = page.getByText("Saved", { exact: true }).first();
  await expect(saved)
    .not.toBeVisible({ timeout: 3_000 })
    .catch(() => {
      // A fast local server can move directly through dirty/saving between
      // animation frames; the settled assertion below is authoritative.
    });
  await expect(saved).toBeVisible({ timeout: 15_000 });
}

async function selectFirstProseWord(
  page: import("@playwright/test").Page,
  editor: import("@playwright/test").Locator,
) {
  const paragraph = editor.locator("p").filter({ hasText: /\S/ }).first();
  await paragraph.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      const match = textNode.textContent?.match(/\S+/);
      if (match?.index !== undefined) {
        const range = document.createRange();
        range.setStart(textNode, match.index);
        range.setEnd(textNode, match.index + match[0].length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
        return;
      }
      textNode = walker.nextNode();
    }
    throw new Error("No prose word was available to select");
  });
  await expect(
    page.getByRole("button", { name: "Edit the selected passage with AI" }),
  ).toBeEnabled();
}

async function openPendingSuggestions(page: import("@playwright/test").Page, minimumCount = 1) {
  await page.getByRole("button", { name: /^Suggestions/ }).click();
  const list = page.getByRole("group", { name: "Suggestion list" });
  await expect(list).toBeVisible();
  const rows = list.locator("li");
  try {
    await rows.first().waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    missingE2EFixture("the first drafted chapter has no pending suggestions");
  }
  const count = await rows.count();
  if (count < minimumCount) {
    missingE2EFixture(
      `the first drafted chapter needs at least ${minimumCount} pending suggestions; found ${count}`,
    );
  }
  return rows;
}

async function closeOpenSheet(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Close", exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test("phone editing autosaves, reloads, detects conflict, and restores the fixture", async ({
  page,
  context,
}) => {
  const { url, editor } = await openFirstDraftedChapter(page);
  const probe = ` [mobile-editor-probe-${Date.now()}]`;
  const competingProbe = ` [stale-tab-probe-${Date.now()}]`;
  let probeInserted = false;
  const secondPage = await context.newPage();
  await secondPage.goto(url);
  const staleEditor = secondPage.locator('[contenteditable="true"]').first();
  await expect(staleEditor).toBeVisible({ timeout: 20_000 });

  try {
    await appendAtDocumentEnd(page, editor, probe);
    probeInserted = true;
    await waitForSaved(page);
    await page.reload();
    await expect(page.locator('[contenteditable="true"]').first()).toContainText(probe.trim());

    await appendAtDocumentEnd(secondPage, staleEditor, competingProbe);
    await expect(
      secondPage.getByRole("heading", { name: "This chapter changed somewhere else" }),
    ).toBeVisible({ timeout: 15_000 });
    await secondPage.getByRole("button", { name: "Reload theirs" }).click();
    await expect(secondPage.locator('[contenteditable="true"]').first()).toContainText(
      probe.trim(),
    );
  } finally {
    await page.bringToFront();
    if (probeInserted) {
      await page.reload();
      const cleanupEditor = page.locator('[contenteditable="true"]').first();
      await cleanupEditor.click();
      await page.keyboard.press("Control+End");
      for (let index = 0; index < probe.length; index += 1) {
        await page.keyboard.press("Shift+ArrowLeft");
      }
      await page.keyboard.press("Backspace");
      await waitForSaved(page);
    }
    await secondPage.close();
  }
});

test("a rejected AI request announces a terminal failure", async ({ page }) => {
  const { editor } = await openFirstDraftedChapter(page);
  await page.route("**/api/chapters/*/edits", (route) => route.abort("failed"));

  await editor.click();
  await page.keyboard.press("Control+Home");
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Shift+ArrowRight");
  }

  const selectionTools = page.getByRole("button", {
    name: "Edit the selected passage with AI",
  });
  await expect(selectionTools).toBeEnabled();
  await selectionTools.click();
  await page.getByRole("button", { name: "Rewrite" }).click();

  await expect(
    page.getByRole("status").filter({
      hasText: "The editor couldn't produce a suggestion. Try again.",
    }),
  ).toBeAttached();
});

test("seeded suggestions can be accepted, rejected, and edited before applying", async ({
  page,
}) => {
  const { editor } = await openFirstDraftedChapter(page);

  let rows = await openPendingSuggestions(page, 3);
  const startingCount = await rows.count();
  const acceptedText = (await rows.first().locator("ins").innerText()).trim();
  await rows.first().getByRole("button", { name: "Accept", exact: true }).click();
  await expect(rows).toHaveCount(startingCount - 1);
  await expect(
    page.getByRole("status").filter({ hasText: "Suggestion applied to the chapter." }),
  ).toBeAttached();
  await closeOpenSheet(page);
  await expect(editor).toContainText(acceptedText);

  rows = await openPendingSuggestions(page, 2);
  const beforeRejectCount = await rows.count();
  const rejectedOriginal = (await rows.first().locator("del").innerText()).trim();
  await rows.first().getByRole("button", { name: "Reject", exact: true }).click();
  await expect(rows).toHaveCount(beforeRejectCount - 1);
  await expect(
    page.getByRole("status").filter({ hasText: "Suggestion dismissed." }),
  ).toBeAttached();
  await closeOpenSheet(page);
  await expect(editor).toContainText(rejectedOriginal);

  rows = await openPendingSuggestions(page);
  const row = rows.first();
  await row.locator("button").first().click();
  const card = page.getByRole("group", { name: "Editor suggestion" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  const authoredWording = `The author chose this exact wording ${Date.now()}.`;
  await card.getByRole("textbox", { name: "Edit the suggested text" }).fill(authoredWording);
  await card.getByRole("button", { name: "Apply edit" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Your edit was applied to the passage." }),
  ).toBeAttached();
  await waitForSaved(page);
  await expect(editor).toContainText(authoredWording);
  await page.reload();
  await expect(page.locator('[contenteditable="true"]').first()).toContainText(authoredWording);
});

test("chapter history restores a seeded generated revision on a phone", async ({ page }) => {
  const { editor } = await openFirstDraftedChapter(page);
  const probe = ` [history-restore-probe-${Date.now()}]`;
  await appendAtDocumentEnd(page, editor, probe);
  await waitForSaved(page);
  await expect(editor).toContainText(probe.trim());

  await page.getByRole("button", { name: "Chapter history" }).click();
  await expect(page.getByRole("heading", { name: "Chapter history" })).toBeVisible();
  const generatedRevision = page
    .getByRole("list", { name: "Revisions" })
    .getByRole("button", { name: /Generated/ })
    .first();
  try {
    await generatedRevision.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    missingE2EFixture("the first drafted chapter has no workflow/Generated revision");
  }
  await generatedRevision.click();
  await page.getByRole("button", { name: "Restore this version" }).click();
  await expect(page.getByRole("heading", { name: "Chapter history" })).not.toBeVisible();
  await expect(editor).not.toContainText(probe.trim());

  await page.reload();
  await expect(page.locator('[contenteditable="true"]').first()).not.toContainText(probe.trim());
});

test("a successful intercepted content tool inserts and saves a diagram", async ({ page }) => {
  const { editor } = await openFirstDraftedChapter(page);
  const diagramSource = "flowchart TD\n  Brief[Author brief] --> Book[Finished book]";
  let toolRequests = 0;

  await page.route("**/api/content-tools/mermaid", async (route) => {
    toolRequests += 1;
    const body = route.request().postDataJSON() as { chapterId?: string; text?: string };
    expect(body.chapterId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(body.text?.trim().length).toBeGreaterThan(0);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ output: { kind: "mermaid", source: diagramSource } }),
    });
  });
  // Rendering a Mermaid block normally uploads a cache for reader/export
  // surfaces. Keep this acceptance test hermetic: it is proving the editor
  // insertion path, not Blob storage.
  await page.route("**/api/assets/diagram", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );

  // Select one real prose word. A whole-document selection spans block
  // boundaries and is intentionally rejected by markdownSelection.
  await selectFirstProseWord(page, editor);
  const selectionTools = page.getByRole("button", {
    name: "Edit the selected passage with AI",
  });
  await expect(selectionTools).toBeEnabled();
  await selectionTools.click();
  await page.getByRole("button", { name: "Diagram", exact: true }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Diagram added below the passage." }),
  ).toBeAttached();
  await expect(page.locator('[data-mermaid-figure="true"]')).toBeVisible();
  expect(toolRequests).toBe(1);
  await waitForSaved(page);

  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator('[data-mermaid-figure="true"]')).toHaveCount(0);
  await waitForSaved(page);

  const redo = page.getByRole("button", { name: "Redo" });
  await expect(redo).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator('[data-mermaid-figure="true"]')).toBeVisible();
  await waitForSaved(page);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator('[data-mermaid-figure="true"]')).toHaveCount(0);
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('[data-mermaid-figure="true"]')).toHaveCount(0);
});

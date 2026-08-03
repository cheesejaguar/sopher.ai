/**
 * DB-backed public-reader acceptance.
 *
 * The fixture rows live in scripts/seed-e2e.ts and therefore inherit the
 * repository's explicit disposable-database guard. These cases are read-only:
 * they exchange test bearer fragments for browser cookies but never mutate an
 * author project or a production environment.
 */
import { createHash } from "node:crypto";

import type { BrowserContext, Page } from "@playwright/test";

import { axeCheck, expect, test } from "./helpers";

const SHARES = {
  first: {
    id: "80808080-0000-4000-8000-000000000001",
    title: "The Clockmaker's Map — Reader Proof",
    tokenLabel: "first",
  },
  second: {
    id: "80808080-0000-4000-8000-000000000002",
    title: "The Observatory Ledger — Reader Proof",
    tokenLabel: "second",
  },
  revoked: {
    id: "80808080-0000-4000-8000-000000000003",
    tokenLabel: "revoked",
  },
  expired: {
    id: "80808080-0000-4000-8000-000000000004",
    tokenLabel: "expired",
  },
} as const;

function fixtureToken(label: string): string {
  return createHash("sha256").update(`sopher-reader-e2e:${label}`, "utf8").digest("base64url");
}

function readerPath(shareId: string): string {
  return `/r/${shareId}`;
}

function readerCookieName(shareId: string): string {
  return `sopher_reader_${shareId.replaceAll("-", "")}`;
}

async function openReader(
  page: Page,
  share: { id: string; title: string; tokenLabel: string },
): Promise<{ token: string; requestedUrls: string[] }> {
  const token = fixtureToken(share.tokenLabel);
  const requestedUrls: string[] = [];
  const observeRequest = (request: { url(): string }) => requestedUrls.push(request.url());
  page.on("request", observeRequest);
  try {
    await page.goto(`${readerPath(share.id)}#token=${token}`);
    await expect(page.getByRole("heading", { level: 1, name: share.title })).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    page.off("request", observeRequest);
  }

  const finalUrl = new URL(page.url());
  expect(finalUrl.pathname).toBe(readerPath(share.id));
  expect(finalUrl.hash, "the bearer fragment must be scrubbed after exchange").toBe("");
  expect(finalUrl.search, "the bearer token must never move into the query string").toBe("");
  expect(
    requestedUrls.filter((url) => url.includes(token)),
    "browser requests must never transmit the URL-fragment bearer token",
  ).toEqual([]);
  return { token, requestedUrls };
}

async function readerCookie(context: BrowserContext, shareId: string) {
  const cookies = await context.cookies();
  return cookies.find((cookie) => cookie.name === readerCookieName(shareId));
}

async function expectNoPageOverflow(page: Page, label: string) {
  await page.evaluate(() => document.fonts.ready);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth,
    `${label} has page-level horizontal overflow: ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test.beforeEach(() => {
  test.setTimeout(120_000);
});

test("fragment exchange isolates two reader sessions and enforces download permission", async ({
  page,
  context,
}) => {
  const first = await openReader(page, SHARES.first);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(
    page.getByRole("link", { name: "Download this reader edition as Markdown" }),
  ).toBeVisible();

  const second = await openReader(page, SHARES.second);
  await expect(
    page.getByRole("link", { name: "Download this reader edition as Markdown" }),
  ).toHaveCount(0);

  const firstCookie = await readerCookie(context, SHARES.first.id);
  const secondCookie = await readerCookie(context, SHARES.second.id);
  expect(firstCookie).toMatchObject({
    value: first.token,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: readerPath(SHARES.first.id),
  });
  expect(secondCookie).toMatchObject({
    value: second.token,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: readerPath(SHARES.second.id),
  });

  // Both scoped cookies coexist. Navigating without either fragment must load
  // the edition selected by the path, never whichever share opened last.
  await page.goto(readerPath(SHARES.first.id));
  await expect(page.getByRole("heading", { level: 1, name: SHARES.first.title })).toBeVisible();
  await page.goto(readerPath(SHARES.second.id));
  await expect(page.getByRole("heading", { level: 1, name: SHARES.second.title })).toBeVisible();

  // Execute downloads inside Chromium so the same real cookie jar used by the
  // reader pages applies Secure, share-path-scoped cookies to each request.
  const downloadResponse = await page.evaluate(
    async (path) => {
      const response = await fetch(path, { credentials: "same-origin" });
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        contentDisposition: response.headers.get("content-disposition"),
        cacheControl: response.headers.get("cache-control"),
        body: await response.text(),
      };
    },
    `${readerPath(SHARES.first.id)}/download`,
  );
  expect(downloadResponse.status).toBe(200);
  expect(downloadResponse.contentType).toContain("text/markdown");
  expect(downloadResponse.contentDisposition).toMatch(/^attachment;.+\.md"$/);
  expect(downloadResponse.cacheControl).toContain("no-store");
  expect(downloadResponse.body).toContain(`# ${SHARES.first.title}`);
  expect(downloadResponse.body).toContain("## Chapter 1 — The Room Beneath the Hour");
  expect(downloadResponse.body).toContain(
    "The stair ended in a circular chamber lined with brass shelves.",
  );

  const blockedDownload = await page.evaluate(
    async (path) => {
      const response = await fetch(path, { credentials: "same-origin" });
      return { status: response.status, body: await response.text() };
    },
    `${readerPath(SHARES.second.id)}/download`,
  );
  expect(blockedDownload.status).toBe(404);
  expect(blockedDownload.body).not.toContain(SHARES.second.title);
});

test("reopening the original fragment with a valid cookie scrubs history without re-exchange", async ({
  page,
  context,
}) => {
  const first = await openReader(page, SHARES.first);
  expect(await readerCookie(context, SHARES.first.id)).toMatchObject({
    value: first.token,
    httpOnly: true,
    path: readerPath(SHARES.first.id),
  });

  await page.goto("about:blank");
  const requests: Array<{ method: string; url: string; postData: string | null }> = [];
  const observeRequest = (request: {
    method(): string;
    url(): string;
    postData(): string | null;
  }) => {
    requests.push({
      method: request.method(),
      url: request.url(),
      postData: request.postData(),
    });
  };
  page.on("request", observeRequest);
  try {
    await page.goto(`${readerPath(SHARES.first.id)}#token=${first.token}`);
    await expect(page.getByRole("heading", { level: 1, name: SHARES.first.title })).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toBe("");

    await page.goBack();
    await expect.poll(() => page.url()).toBe("about:blank");
    await page.goForward();
    await expect(page.getByRole("heading", { level: 1, name: SHARES.first.title })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
  } finally {
    page.off("request", observeRequest);
  }

  expect(
    requests.filter(
      (request) =>
        request.url.endsWith("/api/reader-session") && request.method.toUpperCase() === "POST",
    ),
    "an established reader session must not post the fragment bearer again",
  ).toEqual([]);
  expect(
    requests.filter(
      (request) => request.url.includes(first.token) || request.postData?.includes(first.token),
    ),
    "the reopened fragment bearer must not enter request URLs or bodies",
  ).toEqual([]);
});

test("revoked and expired bearer links fail closed without leaving a session cookie", async ({
  page,
  context,
}) => {
  for (const share of [SHARES.revoked, SHARES.expired]) {
    const token = fixtureToken(share.tokenLabel);
    const requestedUrls: string[] = [];
    const observeRequest = (request: { url(): string }) => requestedUrls.push(request.url());
    page.on("request", observeRequest);
    try {
      await page.goto(`${readerPath(share.id)}#token=${token}`);
      const invalidLinkAlert = page
        .getByRole("alert")
        .filter({ hasText: "This reader link is not available" });
      await expect(invalidLinkAlert).toHaveCount(1, { timeout: 30_000 });
      await expect(invalidLinkAlert).toContainText("It may have expired or been revoked.");
    } finally {
      page.off("request", observeRequest);
    }

    expect(new URL(page.url()).hash).toBe("");
    expect(requestedUrls.filter((url) => url.includes(token))).toEqual([]);
    expect(await readerCookie(context, share.id)).toBeUndefined();
  }
});

test("reader prose reflows at 320px and 390px with no serious accessibility findings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openReader(page, SHARES.first);

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize(viewport);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: SHARES.first.title })).toBeVisible();
    await expectNoPageOverflow(page, `reader at ${viewport.width}px`);

    const recoveredParagraph = page.getByText(
      "The stair ended in a circular chamber lined with brass shelves. Each shelf held a glass tile etched with a different street, bridge, or rooftop from Bellweather.",
      { exact: true },
    );
    await expect(recoveredParagraph).toBeVisible();
    const layout = await recoveredParagraph.evaluate((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        whiteSpace: style.whiteSpace,
        left: rect.left,
        right: rect.right,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    expect(layout.whiteSpace).not.toBe("pre");
    expect(layout.whiteSpace).not.toBe("nowrap");
    expect(layout.left).toBeGreaterThanOrEqual(-1);
    expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
    await axeCheck(page);
  }
});

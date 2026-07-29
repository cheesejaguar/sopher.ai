/**
 * SEO regression guards. DB-free.
 *
 * These exist because every failure mode here is silent: a dropped canonical, a
 * page missing from the sitemap, or JSON-LD that stops parsing costs traffic
 * for weeks before anyone notices, and nothing in the app breaks.
 */
import { expect, test } from "./helpers";

const PUBLIC_PAGES = ["/", "/pricing", "/terms", "/privacy", "/refunds"];

test.describe("sitemap and robots", () => {
  test("sitemap lists every public page with a lastModified", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    for (const path of PUBLIC_PAGES) {
      expect(xml, `sitemap missing ${path}`).toContain(`<loc>https://sopher.ai${path}</loc>`);
    }
    expect(xml).toContain("<lastmod>");
  });

  test("robots names the AI crawlers and hides the private surfaces", async ({ request }) => {
    const txt = await (await request.get("/robots.txt")).text();
    for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
      expect(txt, `robots does not name ${bot}`).toContain(bot);
    }
    for (const path of ["/studio", "/admin", "/sign-in"]) {
      expect(txt).toContain(`Disallow: ${path}`);
    }
    expect(txt).toContain("Sitemap: https://sopher.ai/sitemap.xml");
  });

  test("llms.txt serves plain text with the real prices", async ({ request }) => {
    const res = await request.get("/llms.txt");
    expect(res.headers()["content-type"]).toContain("text/plain");
    const txt = await res.text();
    expect(txt).toContain("# sopher.ai");
    // Derived from CREDIT_PACKS — catches the file drifting from checkout.
    expect(txt).toContain("Starter: $25 for 25 credits");
    expect(txt).toContain("Press: $300 for 360 credits");
  });
});

test.describe("page metadata", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has a canonical, a description, and exactly one h1`, async ({ page }) => {
      await page.goto(path);

      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveCount(1);
      // Next drops the trailing slash on the root canonical, which is correct
      // — https://sopher.ai and https://sopher.ai/ are the same resource.
      const expected = path === "/" ? "https://sopher.ai" : `https://sopher.ai${path}`;
      await expect(canonical).toHaveAttribute("href", expected);

      const description = await page.locator('meta[name="description"]').getAttribute("content");
      expect(description?.length ?? 0).toBeGreaterThan(50);
      // Google truncates around 160; over that is wasted, not harmful.
      expect(description!.length).toBeLessThanOrEqual(200);

      await expect(page.locator("h1")).toHaveCount(1);
    });
  }

  test("auth pages are noindex so they cannot outrank the homepage", async ({ page }) => {
    for (const path of ["/sign-in", "/sign-up"]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }
  });
});

test.describe("structured data", () => {
  test("homepage JSON-LD parses and carries the expected types", async ({ page }) => {
    await page.goto("/");
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(blocks.length).toBeGreaterThan(0);

    const types = new Set<string>();
    for (const raw of blocks) {
      // Throwing here is the point — malformed JSON-LD is silently ignored by
      // crawlers, so a parse error must fail the build rather than the SERP.
      const parsed = JSON.parse(raw);
      for (const node of parsed["@graph"] ?? [parsed]) types.add(node["@type"]);
    }

    for (const expected of ["Organization", "WebSite", "SoftwareApplication", "FAQPage", "HowTo"]) {
      expect([...types], `missing ${expected} JSON-LD`).toContain(expected);
    }
  });

  test("offers match the credit packs the site actually sells", async ({ page }) => {
    await page.goto("/pricing");
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const product = blocks
      .map((raw) => JSON.parse(raw))
      .find((node) => node["@type"] === "SoftwareApplication");

    expect(product).toBeTruthy();
    const prices = product.offers.map((offer: { price: string }) => offer.price);
    expect(prices).toEqual(["25.00", "60.00", "120.00", "300.00"]);
  });

  test("the FAQ is on the homepage, not only on /pricing", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Common questions" })).toBeVisible();
    await expect(page.getByText("How long does a book take?")).toBeVisible();
  });
});

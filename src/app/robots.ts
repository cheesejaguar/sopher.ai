import type { MetadataRoute } from "next";

import { SITE_URL } from "@/components/seo/json-ld";

/**
 * Two things a bare `allow: "/"` was not doing.
 *
 * First, the private surfaces. /studio and /admin are auth-gated, so a crawler
 * only ever reaches a sign-in redirect — but the URLs are linked from the
 * footer and nav, and crawl budget spent on redirects is crawl budget not spent
 * on the marketing pages. /sign-in and /sign-up were fully public and
 * indexable, which is how thin auth pages end up outranking the homepage for
 * brand queries.
 *
 * Second, the AI crawlers. The wildcard already permits them, but naming them
 * explicitly is what their operators' compliance tooling looks for, and it
 * makes the decision to be included in answer engines a visible one rather than
 * an accident of omission.
 */

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
  "cohere-ai",
  "Amazonbot",
];

// Reader pages carry an enforced noindex response header. They remain
// crawlable so compliant engines can see and honor it; robots.txt is not an
// access-control mechanism.
const DISALLOW = ["/studio", "/projects", "/admin", "/api/", "/sign-in", "/sign-up"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

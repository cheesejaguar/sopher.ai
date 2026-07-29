import type { MetadataRoute } from "next";

import { SITE_URL } from "@/components/seo/json-ld";

/**
 * `lastModified` was missing on every entry, leaving crawlers no freshness
 * signal at all.
 *
 * A fixed constant rather than a build timestamp, deliberately. A date that
 * moved on every deploy would claim the legal pages changed when only a CSS
 * token did, and crawlers that learn a lastModified is noise start ignoring it.
 * Bump the entry when its content actually changes.
 */
const UPDATED = {
  home: new Date("2026-07-29"),
  pricing: new Date("2026-07-29"),
  legal: new Date("2026-07-29"),
};

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
      lastModified: UPDATED.home,
    },
    {
      url: `${SITE_URL}/pricing`,
      changeFrequency: "monthly",
      priority: 0.8,
      lastModified: UPDATED.pricing,
    },
    {
      url: `${SITE_URL}/terms`,
      changeFrequency: "yearly",
      priority: 0.3,
      lastModified: UPDATED.legal,
    },
    {
      url: `${SITE_URL}/privacy`,
      changeFrequency: "yearly",
      priority: 0.3,
      lastModified: UPDATED.legal,
    },
    {
      url: `${SITE_URL}/refunds`,
      changeFrequency: "yearly",
      priority: 0.3,
      lastModified: UPDATED.legal,
    },
  ];
}

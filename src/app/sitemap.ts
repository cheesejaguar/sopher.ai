import type { MetadataRoute } from "next";

import { SITE_URL } from "@/components/seo/json-ld";
import { GENRE_PAGES } from "@/lib/marketing/genre-pages";
import { GUIDES } from "@/lib/marketing/guides";

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
  legal: new Date("2026-08-02"),
  content: new Date("2026-07-29"),
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
    // Genres and guides are generated from the same lists the pages render, so
    // a new one cannot be added without appearing here.
    {
      url: `${SITE_URL}/genres`,
      changeFrequency: "monthly",
      priority: 0.7,
      lastModified: UPDATED.content,
    },
    ...GENRE_PAGES.map((page) => ({
      url: `${SITE_URL}/genres/${page.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      lastModified: UPDATED.content,
    })),
    {
      url: `${SITE_URL}/guides`,
      changeFrequency: "monthly",
      priority: 0.7,
      lastModified: UPDATED.content,
    },
    ...GUIDES.map((guide) => ({
      url: `${SITE_URL}/guides/${guide.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      lastModified: UPDATED.content,
    })),
  ];
}

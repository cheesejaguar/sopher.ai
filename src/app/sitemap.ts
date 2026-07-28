import type { MetadataRoute } from "next";

const BASE_URL = "https://sopher.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${BASE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/pricing`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}

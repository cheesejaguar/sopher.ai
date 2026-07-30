import type { Metadata } from "next";

import { SITE_URL, SOCIAL_IMAGE, SOCIAL_IMAGE_ALT } from "@/components/seo/json-ld";

/**
 * Keeps a public page's canonical, Open Graph card, and Twitter card on the
 * same title, description, and URL. Root social metadata otherwise survives
 * nested page metadata and makes every shared URL look like the homepage.
 */
export function publicPageMetadata({
  title,
  description,
  path,
  type = "website",
}: {
  title: string;
  description: string;
  path: `/${string}`;
  type?: "website" | "article";
}): Metadata {
  const socialTitle = `${title} · sopher.ai`;
  const url = `${SITE_URL}${path}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: socialTitle,
      description,
      url,
      type,
      images: [
        {
          url: SOCIAL_IMAGE,
          width: 1200,
          height: 630,
          alt: SOCIAL_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [{ url: SOCIAL_IMAGE, alt: SOCIAL_IMAGE_ALT }],
    },
  };
}

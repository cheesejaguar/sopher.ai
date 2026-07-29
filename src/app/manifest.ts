import type { MetadataRoute } from "next";

/**
 * Web app manifest. Small but load-bearing: it is what lets the studio be
 * installed to a home screen, and Google reads `name`/`description` as
 * corroborating signals for the site's identity.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "sopher.ai — Any book you can imagine",
    short_name: "sopher.ai",
    description:
      "Describe any book in a sentence. A team of AI agents plans it, writes every chapter, and edits the whole manuscript.",
    start_url: "/studio",
    display: "standalone",
    background_color: "#101321",
    theme_color: "#101321",
    categories: ["books", "productivity", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}

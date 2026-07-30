import type { MetadataRoute } from "next";

/**
 * Web app manifest. Small but load-bearing: it is what lets the studio be
 * installed to a home screen, and Google reads `name`/`description` as
 * corroborating signals for the site's identity.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "sopher.ai — The book in your head, finally on the page.",
    short_name: "sopher.ai",
    description:
      "Turn the book in your head into a complete, editable manuscript with a visible planning, drafting, and refinement workflow.",
    start_url: "/studio",
    display: "standalone",
    background_color: "#080910",
    theme_color: "#080910",
    categories: ["books", "productivity", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}

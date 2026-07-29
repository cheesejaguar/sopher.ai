import "server-only";

import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitizes a client-rendered Mermaid SVG before it is stored in public blob
 * storage.
 *
 * The server cannot render Mermaid (it needs a DOM), which is why the editor
 * renders and posts the result. That also means the server cannot verify the
 * SVG corresponds to the diagram source it claims — the route accepted any
 * string and served it back with `Content-Type: image/svg+xml`, so a direct
 * POST could park arbitrary active content on a domain associated with the
 * product.
 *
 * The manuscript embeds these via `<img src>`, which already neuters scripts in
 * every current browser; this is the layer that holds when someone opens the
 * blob URL directly or an exporter inlines the markup.
 */
export function sanitizeSvg(svg: string): string | null {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // foreignObject is how HTML — and therefore scripts and event handlers —
    // gets back inside an SVG. Mermaid does use it for text labels in some
    // diagram types, but a lost label beats a live script, and the raster PNG
    // the same request uploads is the fallback for anything that renders badly.
    //
    // href is deliberately NOT forbidden: Mermaid references its own arrowhead
    // markers internally, and DOMPurify's default ALLOWED_URI_REGEXP already
    // rejects javascript:/data: there.
    FORBID_TAGS: ["script", "foreignObject", "iframe", "embed", "object", "animate", "set"],
    FORBID_ATTR: ["formaction", "action"],
  });

  // A sanitizer that ate the whole document means the payload was not an SVG in
  // the first place — store nothing rather than an empty file the exporters
  // would render as a broken image.
  if (!clean.includes("<svg")) return null;
  return clean;
}

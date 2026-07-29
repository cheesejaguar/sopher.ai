import { describe, expect, it } from "vitest";

import { sanitizeSvg } from "./svg";

const MERMAID_LIKE = `<svg id="m1" width="200" height="100" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
  <defs><marker id="arrow" markerWidth="6" markerHeight="6"><path d="M0,0 L6,3 L0,6 z"/></marker></defs>
  <g class="nodes"><rect x="10" y="10" width="80" height="30" rx="4"/><text x="20" y="30">Start</text></g>
  <path d="M90,25 L150,25" marker-end="url(#arrow)"/>
</svg>`;

describe("sanitizeSvg", () => {
  it("keeps the structure a real Mermaid render depends on", () => {
    const clean = sanitizeSvg(MERMAID_LIKE);
    expect(clean).not.toBeNull();
    expect(clean).toContain("<marker");
    expect(clean).toContain("marker-end");
    expect(clean).toContain("url(#arrow)");
    expect(clean).toContain("<text");
    expect(clean).toContain("Start");
  });

  it("strips inline scripts", () => {
    const clean = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>`,
    );
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("alert(1)");
    expect(clean).toContain("<rect");
  });

  it("strips event handlers", () => {
    const clean = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect onclick="alert(2)"/></svg>`,
    );
    expect(clean).not.toContain("onload");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("alert");
  });

  it("strips foreignObject, the usual way HTML gets back into an SVG", () => {
    const clean = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror="alert(1)"></body></foreignObject></svg>`,
    );
    expect(clean).not.toContain("foreignObject");
    expect(clean).not.toContain("onerror");
  });

  it("strips javascript: hrefs while leaving internal references alone", () => {
    const clean = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>`,
    );
    expect(clean).not.toContain("javascript:");
  });

  it("returns null when the payload is not an SVG at all", () => {
    expect(sanitizeSvg("<h1>hello</h1>")).toBeNull();
    expect(sanitizeSvg("<script>alert(1)</script>")).toBeNull();
    expect(sanitizeSvg("")).toBeNull();
  });
});

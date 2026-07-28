"use client";

import type { MouseEvent } from "react";

const TARGET_ID = "main-content";

/**
 * Skip-to-content link (WCAG 2.4.1 Bypass Blocks).
 *
 * Off-screen until focused, then slides into the top-left corner.
 *
 * The `<main>` element is rendered by each route-group layout rather than the
 * root layout, so the handler resolves it at activation time and gives it the
 * anchor id plus a programmatic focus target. The plain `href` keeps working
 * unchanged if a layout ever renders `id="main-content"` itself.
 */
export function SkipLink() {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const target =
      document.getElementById(TARGET_ID) ?? document.querySelector<HTMLElement>("main");
    if (!target) return;
    event.preventDefault();
    if (!target.id) target.id = TARGET_ID;
    target.setAttribute("tabindex", "-1");
    target.focus();
  }

  return (
    <a
      href={`#${TARGET_ID}`}
      onClick={handleClick}
      className="fixed top-3 left-3 z-100 -translate-y-[calc(100%+1rem)] rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-lg transition-transform focus-visible:translate-y-0"
    >
      Skip to main content
    </a>
  );
}

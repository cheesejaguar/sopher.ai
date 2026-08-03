"use client";

import * as React from "react";

const UNNAMED_WEBKIT_GUARD = '[data-base-ui-focus-guard][role="button"]:not([aria-label])';

function labelWebKitFocusGuards(root: ParentNode) {
  for (const guard of root.querySelectorAll<HTMLElement>(UNNAMED_WEBKIT_GUARD)) {
    // Base UI adds role=button only for WebKit + VoiceOver so its focus trap
    // can catch virtual-cursor movement. A name keeps that intentional command
    // valid in the accessibility tree without changing its focus behavior.
    guard.setAttribute("aria-label", "Focus boundary");
  }
}

/**
 * Compatibility shim for Base UI 1.6 focus guards. Remove once the primitive
 * supplies an accessible name for its WebKit-only role=button guards.
 */
export function BaseUiFocusGuardLabels() {
  React.useEffect(() => {
    labelWebKitFocusGuards(document);
    const observer = new MutationObserver(() => labelWebKitFocusGuards(document));
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["role"],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}

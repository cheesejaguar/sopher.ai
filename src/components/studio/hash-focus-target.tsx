"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Moves focus to a visible fragment target after either an initial cross-page
 * navigation or a same-page hash change. Next can briefly retain hidden route
 * trees, so an inert duplicate must never steal assistive-technology focus.
 */
export function useHashTargetFocus<T extends HTMLElement = HTMLElement>(targetId: string) {
  const targetRef = React.useRef<T | null>(null);
  React.useEffect(() => {
    let frame: number | undefined;
    const focusTarget = () => {
      if (window.location.hash !== `#${targetId}`) return;
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const target = targetRef.current;
        if (!target || target.getClientRects().length === 0) return;
        target.focus({ preventScroll: true });
      });
    };
    focusTarget();
    window.addEventListener("hashchange", focusTarget);
    return () => {
      window.removeEventListener("hashchange", focusTarget);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [targetId]);

  return React.useCallback((node: T | null) => {
    targetRef.current = node;
  }, []);
}

type HashFocusTargetProps = {
  as?: "div" | "header" | "section";
  id: string;
  children: React.ReactNode;
  className?: string;
  role?: React.AriaRole;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

export function HashFocusTarget({
  as = "div",
  id,
  children,
  className,
  ...accessibilityProps
}: HashFocusTargetProps) {
  const focusRef = useHashTargetFocus(id);
  const targetClassName = cn(
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
    className,
  );
  const props = {
    id,
    tabIndex: -1,
    className: targetClassName,
    ...accessibilityProps,
  };

  if (as === "header") {
    return (
      <header ref={focusRef} {...props}>
        {children}
      </header>
    );
  }
  if (as === "section") {
    return (
      <section ref={focusRef} {...props}>
        {children}
      </section>
    );
  }
  return (
    <div ref={focusRef} {...props}>
      {children}
    </div>
  );
}

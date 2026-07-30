"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type ElementVisibilityOptions = {
  rootMargin?: string;
  threshold?: number;
};

function subscribeToDocumentVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function getDocumentVisibility() {
  return !document.hidden;
}

function getServerDocumentVisibility() {
  return true;
}

/**
 * Reports whether an element is in the viewport while the document is visible.
 * Browsers without IntersectionObserver retain the visible fallback, so this
 * remains a performance enhancement rather than a functional dependency.
 */
export function useElementVisibility<T extends Element>({
  rootMargin = "0px",
  threshold = 0,
}: ElementVisibilityOptions = {}) {
  const ref = useRef<T | null>(null);
  const [elementVisible, setElementVisible] = useState(true);
  const documentVisible = useSyncExternalStore(
    subscribeToDocumentVisibility,
    getDocumentVisibility,
    getServerDocumentVisibility,
  );

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setElementVisible(entry?.isIntersecting ?? false),
      { rootMargin, threshold },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return { ref, isVisible: elementVisible && documentVisible };
}

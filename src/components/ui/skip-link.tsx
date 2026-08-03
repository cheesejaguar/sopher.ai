const TARGET_ID = "main-content";

/**
 * Skip-to-content link (WCAG 2.4.1 Bypass Blocks).
 *
 * Off-screen until focused, then slides into the top-left corner.
 * It shares the root Suspense boundary with each route-owned main region, so
 * the native fragment and its exact target become operable at the same time.
 */
export function SkipLink() {
  return (
    <a
      href={`#${TARGET_ID}`}
      className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-[max(0.75rem,env(safe-area-inset-left))] z-100 -translate-y-[calc(100%+1rem)] rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-lg transition-transform focus-visible:translate-y-0 motion-reduce:transition-none"
    >
      Skip to main content
    </a>
  );
}
